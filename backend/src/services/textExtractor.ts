import mammoth from 'mammoth';
import { BadRequestError } from '../utils/errors';

export interface ExtractedText {
  text: string;
  pageCount?: number;
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedText> {
  switch (mimeType) {
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
      throw new BadRequestError(`Unsupported file type: ${mimeType}`);
  }
}

async function extractFromPDF(buffer: Buffer): Promise<ExtractedText> {
  try {
    const pdfParse = await import('pdf-parse');
    const data = await (pdfParse.default || pdfParse)(buffer);
    return {
      text: data.text || '',
      pageCount: data.numpages,
    };
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

export function isMimeTypeSupported(mimeType: string): boolean {
  return getSupportedMimeTypes().includes(mimeType);
}