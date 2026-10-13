import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getKnowledgeDocuments, getKnowledgeDocumentById, getKnowledgeChunksByDocument, createKnowledgeDocument, updateKnowledgeDocument, deleteKnowledgeDocument, updateKnowledgeDocumentStatus, searchKnowledgeChunksByVector, searchKnowledgeChunksByText, searchKnowledgeChunksHybrid, processAndIndexDocument } from '../services/knowledge.service';
import { generateEmbedding, EMBEDDING_MODEL } from '../services/embedding';
import { getStaffUserById } from '../services/staff.service';
import { BadRequestError } from '../utils/errors';
import { getPagination, getOptionalString } from '../utils/helpers';
import { createAuditLog } from '../services/audit.service';
import { UserPayload } from '../types';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'text/html',
      'text/csv',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const vectorSearchSchema = z.object({
  vector: z.array(z.number()).min(1, 'Vector is required'),
  limit: z.number().int().positive().max(50).optional(),
  documentId: z.string().uuid().optional(),
});

const textSearchSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500),
  limit: z.number().int().positive().max(50).optional(),
});

const embedSchema = z.object({
  text: z.string().min(1, 'Text is required').max(8000),
});

// Hybrid semantic + trigram search behind one call. n8n's Postgres node splits
// queryReplacement on commas, so a 768-dim vector ("[0.1,0.2,...]") passed as a
// raw param shatters into hundreds of fragments and the whole retrieval errors
// out (empty knowledge -> generic "our company" greeting). The caller sends the
// vector base64-encoded (no commas) and the backend decodes it server-side.
const hybridSearchSchema = z.object({
  embeddingB64: z.string().min(1, 'embeddingB64 is required').max(200000),
  message: z.string().min(1, 'message is required').max(500),
  hasVector: z.boolean().default(true),
  businessId: z.string().uuid('businessId must be a UUID'),
  limit: z.number().int().positive().max(50).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255).optional(),
  document_type: z.enum(['pdf', 'docx', 'txt', 'html', 'markdown', 'website', 'faq', 'policy', 'other']).optional(),
  source: z.string().optional(),
  file_name: z.string().optional(),
  language: z.string().max(10).optional(),
  status: z.enum(['pending', 'processing', 'indexed', 'failed', 'archived']).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

const createSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  document_type: z.enum(['pdf', 'docx', 'txt', 'html', 'markdown', 'website', 'faq', 'policy', 'other']),
  source: z.string().optional(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
  checksum: z.string().optional(),
  language: z.string().max(10).optional(),
  status: z.enum(['pending', 'processing', 'indexed', 'failed', 'archived']).optional(),
  metadata: z.record(z.unknown()).optional(),
  business_id: z.string().uuid().optional(),
});


export const listKnowledgeDocuments = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;
  const user = (req as Request & { user?: UserPayload }).user;
  const tenantId = user?.businessId || user?.tenantId;

  // Fail closed: listKnowledgeDocuments is authenticated, so a non-super-admin
  // without a tenant must never fall through to an unscoped list of every
  // tenant's documents. super_admin without x-tenant-id keeps global scope.
  if (!tenantId && user?.role !== 'super_admin') {
    res.json({ success: true, data: [], meta: { page, limit, total: 0, totalPages: 1 } });
    return;
  }

  const result = await getKnowledgeDocuments({
    page,
    limit,
    sortBy,
    sortOrder,
    businessId: tenantId,
    status: getOptionalString(query.status),
    documentType: getOptionalString(query.documentType),
    language: getOptionalString(query.language),
    search: getOptionalString(query.search),
  });

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};

export const getKnowledgeDocument = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;
  const doc = await getKnowledgeDocumentById(req.params.id!, tenantId);

  res.json({
    success: true,
    data: doc,
  });
};

export const createKnowledgeDocumentController = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  try {
    const validated = createSchema.parse(req.body);
    const tenantId = currentUser.businessId || currentUser.tenantId || (await getStaffUserById(currentUser.id)).business_id;
    const doc = await createKnowledgeDocument({ ...validated, businessId: tenantId });

    await createAuditLog(
      'knowledge_documents',
      'create',
      currentUser.id,
      'staff',
      `Knowledge document created: ${doc.title}`,
      undefined,
      doc,
      { documentId: doc.id },
      req.ip!,
      req.get('user-agent')!,
      tenantId
    );

    res.status(201).json({
      success: true,
      data: doc,
      message: 'Knowledge document created',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};

export const updateKnowledgeStatusController = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  const { status } = req.body;

  if (!status) {
    throw new BadRequestError('Status is required');
  }

  // Tenant-scoped: without the caller's businessId any staff user could flip
  // the status of another tenant's document (cross-tenant write).
  const tenantId = currentUser.businessId || currentUser.tenantId;

  const doc = await updateKnowledgeDocumentStatus(req.params.id!, status, tenantId);

  await createAuditLog(
    'knowledge_documents',
    'update_status',
    currentUser.id,
    'staff',
    `Knowledge document status updated to ${status}`,
    undefined,
    { status },
    { documentId: req.params.id! },
    req.ip!,
    req.get('user-agent')!,
    tenantId
  );

  res.json({
    success: true,
    data: doc,
    message: 'Knowledge document status updated',
  });
};

// Full update of a knowledge document's editable fields (tenant-scoped).
export const updateKnowledgeDocumentController = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  const validated = updateSchema.parse(req.body);
  const tenantId = currentUser.businessId || currentUser.tenantId;

  const doc = await updateKnowledgeDocument(req.params.id!, validated, tenantId);

  await createAuditLog(
    'knowledge_documents',
    'update',
    currentUser.id,
    'staff',
    `Knowledge document updated: ${doc.title}`,
    undefined,
    { fields: Object.keys(validated) },
    { documentId: doc.id },
    req.ip!,
    req.get('user-agent')!,
    tenantId
  );

  res.json({
    success: true,
    data: doc,
    message: 'Knowledge document updated',
  });
};

// Delete a knowledge document (tenant-scoped). Chunks cascade-delete via FK.
export const deleteKnowledgeDocumentController = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  const tenantId = currentUser.businessId || currentUser.tenantId;
  await deleteKnowledgeDocument(req.params.id!, tenantId);

  await createAuditLog(
    'knowledge_documents',
    'delete',
    currentUser.id,
    'staff',
    `Knowledge document deleted`,
    undefined,
    undefined,
    { documentId: req.params.id! },
    req.ip!,
    req.get('user-agent')!,
    tenantId
  );

  res.json({
    success: true,
    message: 'Knowledge document deleted',
  });
};

// Chunks for one document (tenant-scoped). The frontend calls this to show
// proof that indexing produced content; without it the UI has no way to list
// chunks and callers resort to unscoped guesses.
export const getKnowledgeDocumentChunks = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;
  // Fail closed: backend routes are authenticated, so a missing tenant here is
  // unexpected — never return another tenant's chunks.
  if (!tenantId) {
    res.json({ success: true, data: [] });
    return;
  }
  const chunks = await getKnowledgeChunksByDocument(req.params.id!, tenantId);
  res.json({ success: true, data: chunks });
};

export const searchKnowledgeChunks = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = vectorSearchSchema.parse(req.body);
    const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;
    // Strict tenant isolation: never search across tenants. This endpoint is
    // optionalAuth (callable by n8n/internal), so an unauthenticated caller has
    // no tenant context -> fail closed with empty results instead of leaking
    // every business's chunks.
    if (!tenantId) {
      res.json({ success: true, data: [] });
      return;
    }
    const chunks = await searchKnowledgeChunksByVector(
      validated.vector,
      validated.limit || 5,
      validated.documentId,
      tenantId
    );

    res.json({
      success: true,
      data: chunks.map(chunk => ({
        id: chunk.id,
        document_id: chunk.document_id,
        chunk_number: chunk.chunk_number,
        chunk_text: chunk.chunk_text,
        token_count: chunk.token_count,
        embedding_model: chunk.embedding_model,
        metadata: chunk.metadata,
        similarity: chunk.similarity,
        source: chunk.metadata?.title || chunk.metadata?.document_title || '',
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};

export const searchKnowledgeChunksText = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = textSearchSchema.parse(req.body);
    const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;
    // Strict tenant isolation: fail closed when there is no tenant context.
    if (!tenantId) {
      res.json({ success: true, data: [] });
      return;
    }
    const chunks = await searchKnowledgeChunksByText(
      validated.query,
      validated.limit || 5,
      tenantId
    );

    res.json({
      success: true,
      data: chunks.map(chunk => ({
        id: chunk.id,
        document_id: chunk.document_id,
        chunk_number: chunk.chunk_number,
        chunk_text: chunk.chunk_text,
        token_count: chunk.token_count,
        embedding_model: chunk.embedding_model,
        metadata: chunk.metadata,
        similarity: chunk.similarity,
        source: chunk.metadata?.title || chunk.metadata?.document_title || '',
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};

// Generate an embedding for a query using the SAME local model that indexes
// documents (all-mpnet-base-v2, 768-dim). n8n's Memory & Context Builder calls
// this so query-side and storage-side vectors live in the same space, which is
// required for pgvector cosine similarity to return relevant chunks.
export const embedText = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = embedSchema.parse(req.body);
    const embedding = await generateEmbedding(validated.text);
    res.json({
      success: true,
      data: {
        embedding,
        model: EMBEDDING_MODEL,
        dimension: embedding.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};

export const hybridSearchKnowledge = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = hybridSearchSchema.parse(req.body);
    const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;

    // Decode the base64 vector -> 768 floats -> pgvector literal.
    let vector: number[];
    try {
      const json = Buffer.from(validated.embeddingB64, 'base64').toString('utf-8');
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        throw new BadRequestError('embeddingB64 must decode to a JSON array of finite numbers');
      }
      vector = parsed as number[];
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError('embeddingB64 is not valid base64-encoded JSON');
    }

    const chunks = await searchKnowledgeChunksHybrid(
      vector,
      validated.message,
      validated.hasVector,
      validated.businessId,
      validated.limit || 10,
      tenantId
    );

    res.json({ success: true, data: chunks });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};

export const uploadKnowledgeDocumentController = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  if (!req.file) {
    throw new BadRequestError('File is required');
  }

  const { title, document_type, language, source } = req.body;

  if (!title || !document_type) {
    throw new BadRequestError('Title and document_type are required');
  }

  try {
    const tenantId = currentUser.businessId || currentUser.tenantId || (await getStaffUserById(currentUser.id)).business_id!;
    const result = await processAndIndexDocument({
      title,
      documentType: document_type,
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalFileName: req.file.originalname,
      language: language || 'en',
      source: source || req.file.originalname,
      businessId: tenantId,
      metadata: { uploadedBy: currentUser.id },
    });

    await createAuditLog(
      'knowledge_documents',
      'create',
      currentUser.id,
      'staff',
      `Knowledge document uploaded and indexed: ${result.document.title}`,
      undefined,
      { documentId: result.document.id, chunksCreated: result.chunksCreated },
      { documentId: result.document.id },
      req.ip!,
      req.get('user-agent')!,
      tenantId
    );

    res.status(201).json({
      success: true,
      data: {
        document: result.document,
        chunksCreated: result.chunksCreated,
      },
      message: `Document uploaded and indexed (${result.chunksCreated} chunks created)`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};

export const uploadMiddleware = upload.single('file');
