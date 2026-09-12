import { query } from '../utils/database';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import { KnowledgeFilters, KnowledgeDocument, KnowledgeChunk } from '../types';
import logger from '../utils/logger';
import { extractTextFromBuffer, isMimeTypeSupported } from './textExtractor';
import { chunkText, TextChunk } from './chunker';
import { generateEmbeddingsBatch, formatEmbeddingForPgVector } from './embedding';
import crypto from 'crypto';

function buildWhereClause(filters: KnowledgeFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.documentType) {
    conditions.push(`document_type = $${paramIndex++}`);
    params.push(filters.documentType);
  }
  if (filters.language) {
    conditions.push(`language = $${paramIndex++}`);
    params.push(filters.language);
  }
  if (filters.search) {
    conditions.push(`(title ILIKE $${paramIndex++} OR source ILIKE $${paramIndex++})`);
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where: whereClause, params };
}

export async function getKnowledgeDocuments(filters: KnowledgeFilters): Promise<{ data: KnowledgeDocument[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const { where, params } = buildWhereClause(filters);

  const countQuery = `SELECT COUNT(*) as total FROM knowledge_documents ${where}`;
  const countResult = await query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataQuery = `
    SELECT id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at
    FROM knowledge_documents
    ${where}
    ORDER BY created_at ${sortOrder}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query<KnowledgeDocument>(dataQuery, [...params, limit, offset]);

  return {
    data: dataResult.rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getKnowledgeDocumentById(id: string): Promise<KnowledgeDocument> {
  const result = await query<KnowledgeDocument>(
    `SELECT id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at
     FROM knowledge_documents
     WHERE id = $1`,
    [id]
  );

  const doc = result.rows[0];

  if (!doc) {
    throw new NotFoundError('Knowledge document not found');
  }

  return doc;
}

export async function createKnowledgeDocument(input: Partial<KnowledgeDocument> & { businessId?: string }): Promise<KnowledgeDocument> {
  const { title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, businessId } = input;

  if (!title || !document_type) {
    throw new BadRequestError('Title and document_type are required');
  }

  if (!businessId) {
    throw new BadRequestError('businessId is required');
  }

  const validTypes = ['pdf', 'docx', 'txt', 'html', 'markdown', 'website', 'faq', 'policy', 'other'];
  if (!validTypes.includes(document_type)) {
    throw new BadRequestError(`Invalid document_type: ${document_type}`);
  }

  if (checksum) {
    const existing = await query('SELECT id FROM knowledge_documents WHERE checksum = $1', [checksum]);
    if (existing.rows.length > 0) {
      throw new ConflictError('Document with this checksum already exists');
    }
  }

  const result = await query<KnowledgeDocument>(
    `INSERT INTO knowledge_documents (title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, business_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at`,
    [title, document_type, source || null, file_name || null, mime_type || null, file_size || null, checksum || null, language || 'en', status || 'pending', metadata || {}, businessId]
  );

  const doc = result.rows[0];

  if (!doc) {
    throw new NotFoundError('Failed to create knowledge document');
  }

  logger.info('Knowledge document created', { documentId: doc.id, title: doc.title });

  return doc;
}

export async function updateKnowledgeDocumentStatus(id: string, status: string): Promise<KnowledgeDocument> {
  const validStatuses = ['pending', 'processing', 'indexed', 'failed', 'archived'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status: ${status}`);
  }

  const result = await query<KnowledgeDocument>(
    `UPDATE knowledge_documents SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at`,
    [status, id]
  );

  const doc = result.rows[0];

  if (!doc) {
    throw new NotFoundError('Knowledge document not found');
  }

  return doc;
}

export async function searchKnowledgeChunksByVector(
  vector: number[],
  limit: number = 5,
  documentId?: string
): Promise<KnowledgeChunk[]> {
  if (!vector || vector.length === 0) {
    throw new BadRequestError('Vector is required');
  }

  const vectorStr = `[${vector.join(',')}]`;
  let sql = `
    SELECT
      kc.id,
      kc.document_id,
      kc.chunk_number,
      kc.chunk_text,
      kc.token_count,
      kc.embedding_model,
      kc.metadata,
      kc.created_at,
      kc.updated_at,
      1 - (kc.embedding <=> $1::vector) AS similarity
    FROM knowledge_chunks kc
    WHERE kc.embedding IS NOT NULL
  `;

  const params: unknown[] = [vectorStr];
  let paramIndex = 2;

  if (documentId) {
    sql += ` AND kc.document_id = $${paramIndex++}`;
    params.push(documentId);
  }

  sql += `
    ORDER BY kc.embedding <=> $1::vector
    LIMIT $${paramIndex}
  `;
  params.push(limit);

  const result = await query<KnowledgeChunk>(sql, params);
  return result.rows;
}

export async function searchKnowledgeChunksByText(
  searchText: string,
  limit: number = 50
): Promise<KnowledgeChunk[]> {
  if (!searchText || searchText.trim().length === 0) {
    return [];
  }

  const result = await query<KnowledgeChunk>(
    `SELECT
      kc.id,
      kc.document_id,
      kc.chunk_number,
      kc.chunk_text,
      kc.token_count,
      kc.embedding_model,
      kc.metadata,
      kc.created_at,
      kc.updated_at,
      similarity(kc.chunk_text, $1) AS similarity
    FROM knowledge_chunks kc
    ORDER BY similarity(kc.chunk_text, $1) DESC
    LIMIT $2`,
    [searchText, limit]
  );
  return result.rows;
}

export interface ProcessDocumentInput {
  title: string;
  documentType: string;
  fileBuffer: Buffer;
  mimeType: string;
  originalFileName: string;
  language?: string;
  source?: string;
  businessId: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessDocumentResult {
  document: KnowledgeDocument;
  chunksCreated: number;
}

export async function processAndIndexDocument(input: ProcessDocumentInput): Promise<ProcessDocumentResult> {
  const { title, documentType, fileBuffer, mimeType, originalFileName, language = 'en', source, metadata = {}, businessId } = input;

  if (!isMimeTypeSupported(mimeType)) {
    throw new BadRequestError(`Unsupported file type: ${mimeType}`);
  }

  const validTypes = ['pdf', 'docx', 'txt', 'html', 'markdown', 'website', 'faq', 'policy', 'other'];
  if (!validTypes.includes(documentType)) {
    throw new BadRequestError(`Invalid document_type: ${documentType}`);
  }

  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const existing = await query('SELECT id FROM knowledge_documents WHERE checksum = $1', [checksum]);
  if (existing.rows.length > 0) {
    throw new ConflictError('Document with this content already exists');
  }

  const docResult = await query<KnowledgeDocument>(
    `INSERT INTO knowledge_documents (title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, business_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9, $10)
     RETURNING id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at`,
    [title, documentType, source || null, originalFileName, mimeType, fileBuffer.length, checksum, language, metadata, businessId]
  );

  const doc = docResult.rows[0];
  if (!doc) {
    throw new BadRequestError('Failed to create knowledge document');
  }

  try {
    const extracted = await extractTextFromBuffer(fileBuffer, mimeType);
    if (!extracted.text || extracted.text.trim().length === 0) {
      throw new BadRequestError('No text content extracted from document');
    }

    const chunks = chunkText(extracted.text, { maxTokens: 800, overlapTokens: 100 });
    if (chunks.length === 0) {
      throw new BadRequestError('Failed to create chunks from document');
    }

    const chunkTexts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddingsBatch(chunkTexts);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      if (!chunk || !embedding) continue;
      const vectorStr = formatEmbeddingForPgVector(embedding);

      await query(
        `INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, token_count, embedding, embedding_model, metadata)
         VALUES ($1, $2, $3, $4, $5::vector, $6, $7)`,
        [doc.id, chunk.chunkIndex, chunk.text, chunk.tokenCount, vectorStr, 'text-embedding-004', metadata]
      );
    }

    await query(
      `UPDATE knowledge_documents SET status = 'indexed', updated_at = NOW() WHERE id = $1`,
      [doc.id]
    );

    logger.info('Document indexed successfully', { 
      documentId: doc.id, 
      title: doc.title, 
      chunksCreated: chunks.length 
    });

    return { document: { ...doc, status: 'indexed' }, chunksCreated: chunks.length };
  } catch (error) {
    await query(
      `UPDATE knowledge_documents SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [doc.id]
    );
    logger.error('Document indexing failed', { documentId: doc.id, error });
    throw error;
  }
}

export async function reindexDocument(documentId: string): Promise<ProcessDocumentResult> {
  const doc = await getKnowledgeDocumentById(documentId);
  
  await query(`DELETE FROM knowledge_chunks WHERE document_id = $1`, [documentId]);
  
  throw new BadRequestError('Reindexing requires original file. Please re-upload the document.');
}
