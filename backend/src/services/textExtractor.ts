import mammoth from 'mammoth';
import { BadRequestError } from '../utils/errors';

/**
 * Hard ceiling on extracted text before chunking. Guards against
 * decompression-bomb documents (a small upload expanding to hundreds of MB of
 * text) and unbounded embedding/prompt cost. Multer's 50 MB body cap is not a
 * substitute — it permits a tiny ZIP that expands far past it.
 */
const MAX_EXTRACTED_TEXT_BYTES = 5 * 1024 * 1024;

/**
 * Lightweight HTML sanitizer for knowledge-base uploads.
 *
 * Stored chunk text is later injected into an LLM system prompt (see the
 * knowledge-search path in knowledge.service.ts), so any HTML that reaches
 * chunkText is effectively tenant-controlled content reaching the model — a
 * prompt-injection surface. We strip non-content elements and all remaining
 * tags rather than trusting a full HTML parser.
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string') return '';
  // Remove script/style and their contents first, before any tag stripping.
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ExtractedText {
  text: string;
  pageCount?: number;
}

export function normalizeMimeType(mimeType?: string, fileName?: string): string {
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() : '';

  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return 'application/pdf';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/docx' ||
    mimeType === 'application/msword' ||
    ext === 'docx'
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (
    mimeType === 'text/markdown' ||
    mimeType === 'text/x-markdown' ||
    ext === 'md' ||
    ext === 'markdown'
  ) {
    return 'text/markdown';
  }
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/csv' ||
    mimeType === 'text/x-csv' ||
    ext === 'csv'
  ) {
    return 'text/csv';
  }
  if (mimeType === 'text/html' || ext === 'html' || ext === 'htm') {
    return 'text/html';
  }
  if (mimeType === 'text/plain' || ext === 'txt') {
    return 'text/plain';
  }
  return mimeType || 'application/octet-stream';
}

export function inferDocumentType(fileName?: string, mimeType?: string): 'pdf' | 'docx' | 'txt' | 'markdown' | 'html' | 'other' {
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() : '';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mimeType?.includes('wordprocessingml')) return 'docx';
  if (ext === 'md' || ext === 'markdown' || mimeType?.includes('markdown')) return 'markdown';
  if (ext === 'txt' || ext === 'csv' || mimeType === 'text/plain' || mimeType === 'text/csv') return 'txt';
  if (ext === 'html' || ext === 'htm' || mimeType === 'text/html') return 'html';
  return 'other';
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<ExtractedText> {
  const normalized = normalizeMimeType(mimeType, fileName);
  let text: string;
  let pageCount: number | undefined;
  switch (normalized) {
    case 'application/pdf':
      ({ text, pageCount } = await extractFromPDF(buffer));
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      ({ text } = await extractFromDOCX(buffer));
      break;
    case 'text/plain':
    case 'text/markdown':
    case 'text/html':
    case 'text/csv':
      text = buffer.toString('utf-8');
      break;
    default:
      throw new BadRequestError(`Unsupported file type: ${mimeType || fileName || 'unknown'}`);
  }

  // HTML is the one type whose raw output is not safe to feed to chunkText and
  // the LLM prompt: strip script/style/svg and all remaining tags.
  if (normalized === 'text/html') {
    text = sanitizeHtml(text);
  }

  // Decompression-bomb / pathological-content guard. A 50 MB upload cap is
  // not enough — a tiny ZIP can expand to hundreds of MB of text, and an
  // attacker-controlled document can inflate the embedding cost and the prompt
  // window. Reject anything beyond a sane ceiling.
  if (text.length > MAX_EXTRACTED_TEXT_BYTES) {
    throw new BadRequestError(
      `Extracted text exceeds the ${MAX_EXTRACTED_TEXT_BYTES} byte limit (${text.length} bytes)`
    );
  }

  return { text, pageCount };
}

async function extractFromPDF(buffer: Buffer): Promise<ExtractedText> {
  try {
    const pdfModule: any = await import('pdf-parse');

    // pdf-parse v2+ exports { PDFParse } class
    if (typeof pdfModule.PDFParse === 'function') {
      const parser = new pdfModule.PDFParse({ data: buffer });
      const result = await parser.getText();
      if (typeof parser.destroy === 'function') {
        try {
          await parser.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
      return {
        text: (result.text || '').trim(),
        pageCount: result.total,
      };
    }

    // pdf-parse v1 exports a function directly (or on .default)
    const parseFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
    if (typeof parseFn === 'function') {
      const data = await parseFn(buffer);
      return {
        text: (data.text || '').trim(),
        pageCount: data.numpages,
      };
    }

    throw new Error('Unsupported pdf-parse module format');
  } catch (error) {
    throw new BadRequestError(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractFromDOCX(buffer: Buffer): Promise<ExtractedText> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      pageCount: undefined,
    };
  } catch (error) {
    throw new BadRequestError(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function getSupportedMimeTypes(): string[] {
  return [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/html',
    'text/csv',
  ];
}

export function isMimeTypeSupported(mimeType: string, fileName?: string): boolean {
  const normalized = normalizeMimeType(mimeType, fileName);
  return getSupportedMimeTypes().includes(normalized);
}