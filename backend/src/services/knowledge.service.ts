import { query } from '../utils/database';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import { KnowledgeFilters, KnowledgeDocument, KnowledgeChunk } from '../types';
import logger from '../utils/logger';
import { extractTextFromBuffer, isMimeTypeSupported } from './textExtractor';
import { chunkText, TextChunk } from './chunker';
import { generateEmbeddingsBatch, formatEmbeddingForPgVector, EMBEDDING_MODEL } from './embedding';
import { rerank, isRerankEnabled, RERANK_CANDIDATES } from './reranker';
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

  const tenantId = filters.businessId || filters.tenantId;
  if (tenantId) {
    conditions.push(`business_id = $${paramIndex++}`);
    params.push(tenantId);
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
    SELECT kd.id, kd.business_id, kd.title, kd.document_type, kd.source, kd.file_name, kd.mime_type, kd.file_size, kd.checksum, kd.language, kd.status, kd.metadata, kd.created_at, kd.updated_at,
      (SELECT COUNT(*) FROM knowledge_chunks kc WHERE kc.document_id = kd.id)::int AS chunk_count
    FROM knowledge_documents kd
    ${where}
    ORDER BY kd.created_at ${sortOrder}
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

export async function getKnowledgeDocumentById(id: string, tenantId?: string): Promise<KnowledgeDocument> {
  let sql = `SELECT id, business_id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at
     FROM knowledge_documents
     WHERE id = $1`;
  const params: unknown[] = [id];

  if (tenantId) {
    sql += ' AND business_id = $2';
    params.push(tenantId);
  }

  const result = await query<KnowledgeDocument>(sql, params);

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
    // Only rows that actually produced a usable index count as duplicates. A
    // previous attempt that FAILED (or never indexed) must not block a retry,
    // so exclude it here and purge it below before re-inserting.
    const existing = await query(
      'SELECT id FROM knowledge_documents WHERE checksum = $1 AND business_id = $2 AND status <> $3',
      [checksum, businessId, 'failed']
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('Document with this checksum already exists for this tenant');
    }
    await query(
      'DELETE FROM knowledge_documents WHERE checksum = $1 AND business_id = $2 AND status = $3',
      [checksum, businessId, 'failed']
    );
  }

  const result = await query<KnowledgeDocument>(
    `INSERT INTO knowledge_documents (title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, business_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, business_id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at`,
    [title, document_type, source || null, file_name || null, mime_type || null, file_size || null, checksum || null, language || 'en', status || 'pending', metadata || {}, businessId]
  );

  const doc = result.rows[0];

  if (!doc) {
    throw new NotFoundError('Failed to create knowledge document');
  }

  logger.info('Knowledge document created', { documentId: doc.id, title: doc.title, businessId });

  return doc;
}

export async function updateKnowledgeDocumentStatus(id: string, status: string, tenantId?: string): Promise<KnowledgeDocument> {
  const validStatuses = ['pending', 'processing', 'indexed', 'failed', 'archived'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status: ${status}`);
  }

  let sql = `UPDATE knowledge_documents SET status = $1, updated_at = NOW() WHERE id = $2`;
  const params: unknown[] = [status, id];

  if (tenantId) {
    sql += ' AND business_id = $3';
    params.push(tenantId);
  }

  sql += ' RETURNING id, business_id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at';

  const result = await query<KnowledgeDocument>(sql, params);

  const doc = result.rows[0];

  if (!doc) {
    throw new NotFoundError('Knowledge document not found');
  }

  return doc;
}

const UPDATABLE_FIELDS = ['title', 'document_type', 'source', 'file_name', 'language', 'status', 'metadata'] as const;
type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

// Full update of a knowledge document's editable fields, tenant-scoped.
export async function updateKnowledgeDocument(
  id: string,
  updates: Partial<Pick<KnowledgeDocument, UpdatableField>>,
  tenantId?: string
): Promise<KnowledgeDocument> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  // Only allow whitelisted fields; ignore anything else.
  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = $${idx++}`);
      params.push(updates[field]);
    }
  }

  if (sets.length === 0) {
    throw new BadRequestError('No valid fields to update');
  }

  if (updates.status !== undefined) {
    const validStatuses = ['pending', 'processing', 'indexed', 'failed', 'archived'];
    if (!validStatuses.includes(updates.status)) {
      throw new BadRequestError(`Invalid status: ${updates.status}`);
    }
  }
  if (updates.document_type !== undefined) {
    const validTypes = ['pdf', 'docx', 'txt', 'html', 'markdown', 'website', 'faq', 'policy', 'other'];
    if (!validTypes.includes(updates.document_type)) {
      throw new BadRequestError(`Invalid document_type: ${updates.document_type}`);
    }
  }

  sets.push('updated_at = NOW()');

  let sql = `UPDATE knowledge_documents SET ${sets.join(', ')} WHERE id = $${idx++}`;
  params.push(id);
  if (tenantId) {
    sql += ` AND business_id = $${idx++}`;
    params.push(tenantId);
  }
  sql += ' RETURNING id, business_id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at';

  const result = await query<KnowledgeDocument>(sql, params);
  const doc = result.rows[0];
  if (!doc) {
    throw new NotFoundError('Knowledge document not found');
  }
  logger.info('Knowledge document updated', { documentId: id, fields: Object.keys(updates), businessId: tenantId });
  return doc;
}

// Delete a knowledge document (tenant-scoped). Associated chunks are removed by
// the fk_chunks_document ON DELETE CASCADE constraint.
export async function deleteKnowledgeDocument(id: string, tenantId?: string): Promise<void> {
  let sql = 'DELETE FROM knowledge_documents WHERE id = $1';
  const params: unknown[] = [id];
  if (tenantId) {
    sql += ' AND business_id = $2';
    params.push(tenantId);
  }
  sql += ' RETURNING id';

  const result = await query<{ id: string }>(sql, params);
  if (result.rows.length === 0) {
    throw new NotFoundError('Knowledge document not found');
  }
  logger.info('Knowledge document deleted', { documentId: id, businessId: tenantId });
}

// Chunks for one document, tenant-scoped through the parent document row.
// Chunk rows also carry business_id (migration 051), but filtering through kd
// keeps a single source of truth even for legacy rows predating that column.
export async function getKnowledgeChunksByDocument(documentId: string, tenantId?: string): Promise<KnowledgeChunk[]> {
  let sql = `
    SELECT kc.id, kc.document_id, kc.chunk_number, kc.chunk_text, kc.token_count,
      kc.embedding_model, kc.metadata, kc.created_at, kc.updated_at
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    WHERE kc.document_id = $1`;
  const params: unknown[] = [documentId];
  if (tenantId) {
    sql += ' AND kd.business_id = $2';
    params.push(tenantId);
  }
  sql += ' ORDER BY kc.chunk_number ASC';
  const result = await query<KnowledgeChunk>(sql, params);
  return result.rows;
}

export async function searchKnowledgeChunksByVector(
  vector: number[],
  limit: number = 5,
  documentId?: string,
  tenantId?: string
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
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    WHERE kc.embedding IS NOT NULL
  `;

  const params: unknown[] = [vectorStr];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND kd.business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

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
  limit: number = 50,
  tenantId?: string
): Promise<KnowledgeChunk[]> {
  if (!searchText || searchText.trim().length === 0) {
    return [];
  }

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
      similarity(kc.chunk_text, $1) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    WHERE 1=1
  `;
  const params: unknown[] = [searchText];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND kd.business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += `
    ORDER BY similarity(kc.chunk_text, $1) DESC
    LIMIT $${paramIndex}
  `;
  params.push(limit);

  const result = await query<KnowledgeChunk>(sql, params);
  return result.rows;
}


export interface HybridKnowledgeHit {
  chunk_text: string;
  metadata: Record<string, unknown>;
  source: string;
  similarity: number;
}

// Improvement #3: cosine top-K candidates are refined by a cross-encoder
// reranker (see services/reranker.ts). Cosine is cheap but shallow; the
// cross-encoder reads query+chunk together and reorders for accuracy.
// We keep the COSINE value in `similarity` — downstream score gates in WF03
// are tuned to the cosine scale, not the reranker's sigmoid scale.
const RERANK_RETURN = 8;

// Hybrid semantic + trigram search executed server-side (single DB round-trip).
// The n8n Postgres node splits queryReplacement on commas, so the 768-dim
// vector can never be passed as a raw query param from n8n — instead the
// caller POSTs it base64-encoded to /search/hybrid and the SQL below runs
// here, where the vector literal is built without any comma-splitting.
export async function searchKnowledgeChunksHybrid(
  vector: number[],
  messageText: string,
  hasVector: boolean,
  businessId: string,
  limit = 10,
  tenantId?: string
): Promise<HybridKnowledgeHit[]> {
  if (!messageText || messageText.trim().length === 0) {
    throw new BadRequestError('messageText is required');
  }
  // Text-only path: embedding unavailable (cold start / failure upstream).
  // Previously this threw 'Vector is required' -> 400 -> n8n continueOnFail
  // silently dropped ALL knowledge. hasVector=false now runs trigram only.
  const useVector = hasVector && !!vector && vector.length === 768;
  if (!businessId) {
    throw new BadRequestError('businessId is required');
  }
  // Authenticated callers must not read across tenants. n8n calls this
  // endpoint unauthenticated (optionalAuth, tenantId undefined) with an
  // explicit businessId — that path is allowed. An authenticated user whose
  // tenant differs from the requested business gets nothing back.
  if (tenantId && tenantId !== businessId) {
    return [];
  }

  const perBranch = Math.min(Math.max(limit * 2, 10), 50);
  // When reranking, fetch a wider candidate pool (top-20) than we return
  // (top-8) so the cross-encoder has room to reorder; without rerank the
  // original behaviour (fetch and return `limit`) is unchanged.
  const rerankEnabled = isRerankEnabled();
  const fetchLimit = rerankEnabled ? Math.max(limit, RERANK_CANDIDATES) : limit;
  const returnLimit = rerankEnabled ? Math.min(limit, RERANK_RETURN) : limit;
  // Thresholds differ per signal: cosine similarities for relevant chunks are
  // typically 0.4-0.7 (see live Rolinj results), while pg_trgm similarity()
  // of a short question against long chunks is typically 0.03-0.15 — a 0.15
  // cutoff empties the text-only fallback path entirely, and in vector mode
  // it discards the trigram UNION leg (whose scores feed the score-gated
  // prompt as weak-match context). Keep the vector leg tight, text leg loose.
  const minVectorSimilarity = 0.15;
  const minTextSimilarity = 0.03;
  // NOTE: each branch variant has its own param list. The text-only variant
  // must NOT include the vector param at all — leaving a $1::vector cast
  // with an empty-string value makes Postgres throw "could not determine
  // data type of parameter $1".
  let sql: string;
  let params: unknown[];
  if (useVector) {
    const vectorStr = `[${(vector as number[]).join(',')}]`;
    // Per-leg thresholds: the trigram leg scores on a far lower scale than
    // cosine, so a single cutoff would wipe it out. Each leg filters on its
    // own scale; the outer ORDER BY + LIMIT then merges both ranked lists.
    sql = `SELECT chunk_text, metadata, source, similarity FROM (
        (SELECT kc.chunk_text, kc.metadata, kd.title AS source,
                1 - (kc.embedding <=> $1::vector) AS similarity
         FROM knowledge_chunks kc
         JOIN knowledge_documents kd ON kc.document_id = kd.id
         WHERE kd.status = 'indexed'
           AND kd.business_id = $3::uuid
           AND kc.embedding IS NOT NULL
           AND kc.chunk_text NOT ILIKE 'dummy content%'
           AND (1 - (kc.embedding <=> $1::vector)) >= $5
         ORDER BY kc.embedding <=> $1::vector
         LIMIT $4)
        UNION ALL
        (SELECT kc.chunk_text, kc.metadata, kd.title AS source,
                COALESCE(similarity(kc.chunk_text, $2), 0) AS similarity
         FROM knowledge_chunks kc
         JOIN knowledge_documents kd ON kc.document_id = kd.id
         WHERE kd.status = 'indexed'
           AND kd.business_id = $3::uuid
           AND kc.chunk_text NOT ILIKE 'dummy content%'
           AND COALESCE(similarity(kc.chunk_text, $2), 0) >= $6
         ORDER BY similarity(kc.chunk_text, $2) DESC
         LIMIT $4)
      ) combined ORDER BY similarity DESC LIMIT $7`;
    params = [vectorStr, messageText, businessId, perBranch, minVectorSimilarity, minTextSimilarity, fetchLimit];
  } else {
    sql = `SELECT chunk_text, metadata, source, similarity FROM (
        (SELECT kc.chunk_text, kc.metadata, kd.title AS source,
                COALESCE(similarity(kc.chunk_text, $1), 0) AS similarity
         FROM knowledge_chunks kc
         JOIN knowledge_documents kd ON kc.document_id = kd.id
         WHERE kd.status = 'indexed'
           AND kd.business_id = $2::uuid
           AND kc.chunk_text NOT ILIKE 'dummy content%'
         ORDER BY similarity(kc.chunk_text, $1) DESC
         LIMIT $3)
      ) combined WHERE similarity >= $4 ORDER BY similarity DESC LIMIT $5`;
    params = [messageText, businessId, perBranch, minTextSimilarity, fetchLimit];
  }
  const result = await query<HybridKnowledgeHit>(sql, params);
  // Deduplicate: same chunk_text can come from both branches; keep max score.
  const seen = new Map<string, HybridKnowledgeHit>();
  for (const r of result.rows) {
    const prev = seen.get(r.chunk_text);
    if (!prev || r.similarity > prev.similarity) seen.set(r.chunk_text, r);
  }
  const hits = [...seen.values()].sort((a, b) => b.similarity - a.similarity);

  // Cross-encoder rerank: reorder the cosine pool, keep the cosine score for
  // downstream gates. Falls back to cosine ordering automatically if the
  // reranker model is unavailable (reranker.rerank returns null).
  let finalHits = hits;
  if (rerankEnabled && hits.length > 1) {
    const ranked = await rerank(messageText, hits.map((h) => h.chunk_text));
    if (ranked) {
      finalHits = ranked
        .map((r) => hits[r.index])
        .filter((h): h is HybridKnowledgeHit => Boolean(h));
      logger.info('Reranked knowledge candidates', {
        candidates: hits.length,
        returned: Math.min(finalHits.length, returnLimit),
      });
    } else {
      finalHits = hits;
    }
  }

  const trimmedHits = finalHits.slice(0, returnLimit);
  logger.info('Hybrid knowledge search', { businessId, hasVector, messageText: messageText.slice(0, 80), hits: trimmedHits.length });
  // No recent-chunks fallback: returning unrelated chunks as "authoritative"
  // forces the AI to hallucinate. Empty array lets the agent honestly escalate.
  return trimmedHits;
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

  if (!isMimeTypeSupported(mimeType, originalFileName)) {
    throw new BadRequestError(`Unsupported file type: ${mimeType}`);
  }

  const validTypes = ['pdf', 'docx', 'txt', 'html', 'markdown', 'website', 'faq', 'policy', 'other'];
  if (!validTypes.includes(documentType)) {
    throw new BadRequestError(`Invalid document_type: ${documentType}`);
  }

  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  // Only rows that actually produced a usable index block a duplicate. A prior
  // attempt that failed extraction/indexing must not block a retry: exclude it
  // here and purge it (chunks cascade) so the re-upload reprocesses cleanly.
  const existing = await query(
    'SELECT id FROM knowledge_documents WHERE checksum = $1 AND business_id = $2 AND status <> $3',
    [checksum, businessId, 'failed']
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('Document with this content already exists');
  }
  await query(
    'DELETE FROM knowledge_documents WHERE checksum = $1 AND business_id = $2 AND status = $3',
    [checksum, businessId, 'failed']
  );

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
    const extracted = await extractTextFromBuffer(fileBuffer, mimeType, originalFileName);
    if (!extracted.text || extracted.text.trim().length === 0) {
      throw new BadRequestError('No text content extracted from document');
    }

    const chunks = chunkText(extracted.text);
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
        `INSERT INTO knowledge_chunks (document_id, business_id, chunk_number, chunk_text, token_count, embedding, embedding_model, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)`,
        [doc.id, businessId, chunk.chunkIndex, chunk.text, chunk.tokenCount, vectorStr, EMBEDDING_MODEL, { ...metadata, section: chunk.section }]
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Persist the real reason so the Knowledge UI can surface why indexing failed
    // (previously the row just flipped to 'failed' with no explanation anywhere).
    await query(
      `UPDATE knowledge_documents
       SET status = 'failed', updated_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('error', $2::text, 'failed_at', NOW())
       WHERE id = $1`,
      [doc.id, message]
    );
    logger.error('Document indexing failed', { documentId: doc.id, error: message });
    throw error;
  }
}

// Re-indexing needs the original file bytes to re-extract + re-embed. We do not
// store the raw file, so we CANNOT reindex in place. This used to DELETE all
// chunks first and then throw — which permanently destroyed the document's
// vectors. It now validates the document exists (tenant-scoped) and returns a
// clear instruction WITHOUT destroying any data.
export async function reindexDocument(documentId: string, tenantId?: string): Promise<{ requiresReupload: true; documentId: string }> {
  await getKnowledgeDocumentById(documentId, tenantId); // 404s if missing / wrong tenant
  logger.info('Reindex requested; original file not stored, instructing re-upload', { documentId, businessId: tenantId });
  return { requiresReupload: true, documentId };
}

export interface CreateTextDocumentInput {
  title: string;
  documentType: string;
  content: string;
  businessId: string;
  language?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

// Manual text document (FAQ, policy, website copy...) written in the dashboard.
// Chunked + embedded synchronously so the AI can retrieve it immediately, with
// the same indexing pipeline as file uploads (checksum dedupe, failure marking).
export async function createTextKnowledgeDocument(input: CreateTextDocumentInput): Promise<ProcessDocumentResult> {
  const { title, documentType, content, businessId, language = 'en', source, metadata = {} } = input;

  if (!title || !title.trim()) {
    throw new BadRequestError('Title is required');
  }
  if (!content || !content.trim()) {
    throw new BadRequestError('Content is required');
  }

  const validTypes = ['pdf', 'docx', 'txt', 'html', 'markdown', 'website', 'faq', 'policy', 'other'];
  if (!validTypes.includes(documentType)) {
    throw new BadRequestError(`Invalid document_type: ${documentType}`);
  }

  const checksum = crypto.createHash('sha256').update(content).digest('hex');
  // Only rows that actually produced a usable index block a duplicate. A prior
  // attempt that failed indexing must not block a retry: exclude it here and
  // purge it (chunks cascade) so the re-submit reprocesses cleanly.
  const existing = await query(
    'SELECT id FROM knowledge_documents WHERE checksum = $1 AND business_id = $2 AND status <> $3',
    [checksum, businessId, 'failed']
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('Document with this content already exists');
  }
  await query(
    'DELETE FROM knowledge_documents WHERE checksum = $1 AND business_id = $2 AND status = $3',
    [checksum, businessId, 'failed']
  );

  const docResult = await query<KnowledgeDocument>(
    `INSERT INTO knowledge_documents (title, document_type, source, language, status, metadata, checksum, business_id)
     VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7)
     RETURNING id, business_id, title, document_type, source, file_name, mime_type, file_size, checksum, language, status, metadata, created_at, updated_at`,
    [title.trim(), documentType, source || null, language, metadata, checksum, businessId]
  );

  const doc = docResult.rows[0];
  if (!doc) {
    throw new BadRequestError('Failed to create knowledge document');
  }

  try {
    const chunks = chunkText(content);
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
        `INSERT INTO knowledge_chunks (document_id, business_id, chunk_number, chunk_text, token_count, embedding, embedding_model, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)`,
        [doc.id, businessId, chunk.chunkIndex, chunk.text, chunk.tokenCount, vectorStr, EMBEDDING_MODEL, { ...metadata, section: chunk.section }]
      );
    }

    await query(
      `UPDATE knowledge_documents SET status = 'indexed', updated_at = NOW() WHERE id = $1`,
      [doc.id]
    );

    logger.info('Text document indexed successfully', {
      documentId: doc.id,
      title: doc.title,
      chunksCreated: chunks.length,
    });

    return { document: { ...doc, status: 'indexed' }, chunksCreated: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await query(
      `UPDATE knowledge_documents
       SET status = 'failed', updated_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('error', $2::text, 'failed_at', NOW())
       WHERE id = $1`,
      [doc.id, message]
    );
    logger.error('Text document indexing failed', { documentId: doc.id, error: message });
    throw error;
  }
}
