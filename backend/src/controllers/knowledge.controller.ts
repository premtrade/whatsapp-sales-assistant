import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getKnowledgeDocuments, getKnowledgeDocumentById, createKnowledgeDocument, updateKnowledgeDocumentStatus, searchKnowledgeChunksByVector, searchKnowledgeChunksByText, processAndIndexDocument } from '../services/knowledge.service';
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

  const result = await getKnowledgeDocuments({
    page,
    limit,
    sortBy,
    sortOrder,
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
  const doc = await getKnowledgeDocumentById(req.params.id!);

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
    const staffUser = await getStaffUserById(currentUser.id);
    const doc = await createKnowledgeDocument({ ...validated, businessId: staffUser.business_id });

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
      req.get('user-agent')!
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

  const doc = await updateKnowledgeDocumentStatus(req.params.id!, status);

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
    req.get('user-agent')!
  );

  res.json({
    success: true,
    data: doc,
    message: 'Knowledge document status updated',
  });
};

export const searchKnowledgeChunks = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = vectorSearchSchema.parse(req.body);
    const chunks = await searchKnowledgeChunksByVector(
      validated.vector,
      validated.limit || 5,
      validated.documentId
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
    const chunks = await searchKnowledgeChunksByText(
      validated.query,
      validated.limit || 5
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
    const staffUser = await getStaffUserById(currentUser.id);
    const result = await processAndIndexDocument({
      title,
      documentType: document_type,
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalFileName: req.file.originalname,
      language: language || 'en',
      source: source || req.file.originalname,
      businessId: staffUser.business_id!,
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
      req.get('user-agent')!
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
