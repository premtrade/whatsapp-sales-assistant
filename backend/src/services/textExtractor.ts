import mammoth from 'mammoth';
import { BadRequestError } from '../utils/errors';

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
  switch (normalized) {
    case 'application/pdf':
      return extractFromPDF(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractFromDOCX(buffer);
    case 'text/plain':
    case 'text/markdown':
    case 'text/html':
    case 'text/csv':
      return { text: buffer.toString('utf-8') };
    default:
      throw new BadRequestError(`Unsupported file type: ${mimeType || fileName || 'unknown'}`);
  }
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