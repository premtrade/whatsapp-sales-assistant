import { Request, Response } from 'express';
import { z } from 'zod';
import { searchKnowledgeChunksHybrid } from '../services/knowledge.service';
import { generateEmbedding, EMBEDDING_MODEL } from '../services/embedding';
import { getBusinessIdentity } from '../services/aiContext.service';
import { query } from '../utils/database';
import { BadRequestError, ForbiddenError } from '../utils/errors';
import { UserPayload } from '../types';
import { resolveRequestTenant } from '../utils/tenant';

/**
 * Knowledge diagnostics.
 *
 * "The document says it is indexed but the AI does not use it" is the most
 * common support question for a RAG setup. These endpoints answer it
 * directly: they show what is stored for the tenant, whether the chunks
 * actually carry embeddings, and what the retrieval returns for a question.
 */

const testQuerySchema = z.object({
  query: z.string().min(1, 'query is required').max(1000),
  limit: z.number().int().positive().max(50).optional().default(10),
  businessId: z.string().uuid().optional(),
});

function resolveScope(req: Request): { tenantId: string | undefined; role: string } {
  const user = (req as Request & { user?: UserPayload }).user;
  return {
    tenantId: resolveRequestTenant(req),
    role: user?.role || '',
  };
}

export const getKnowledgeDiagnostics = async (req: Request, res: Response): Promise<void> => {
  const { tenantId, role } = resolveScope(req);
  const requested = String(req.query.businessId || tenantId || '');
  if (!requested) {
    throw new ForbiddenError('Tenant scope required');
  }
  if (role !== 'super_admin' && tenantId && tenantId !== requested) {
    throw new ForbiddenError('Tenant scope required');
  }

  const business = await getBusinessIdentity(requested);

  const docs = await query<{
    id: string;
    title: string;
    status: string;
    source: string | null;
    document_type: string | null;
    created_at: string;
    chunk_count: string;
    embedded_chunks: string;
  }>(
    `SELECT kd.id,
            kd.title,
            kd.status,
            kd.source,
            kd.document_type,
            kd.created_at,
            COUNT(kc.id) AS chunk_count,
            COUNT(kc.embedding) AS embedded_chunks
       FROM knowledge_documents kd
       LEFT JOIN knowledge_chunks kc ON kc.document_id = kd.id
      WHERE kd.business_id = $1::uuid
        AND kd.deleted_at IS NULL
      GROUP BY kd.id
      ORDER BY kd.created_at DESC`,
    [requested]
  );

  const documents = docs.rows.map((doc) => {
    const chunkCount = Number(doc.chunk_count || 0);
    const embedded = Number(doc.embedded_chunks || 0);
    const issues: string[] = [];
    if (doc.status !== 'indexed') {
      issues.push(`status is "${doc.status}" - only "indexed" documents are searched`);
    }
    if (chunkCount === 0) {
      issues.push('no chunks were created for this document');
    } else if (embedded === 0) {
      issues.push('chunks have no embedding vector - semantic search cannot match them');
    }
    return {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      source: doc.source,
      documentType: doc.document_type,
      createdAt: doc.created_at,
      chunkCount,
      embeddedChunks: embedded,
      retrievable: doc.status === 'indexed' && embedded > 0,
      issues,
    };
  });

  res.json({
    success: true,
    data: {
      business: {
        id: business.id,
        name: business.displayName,
        slug: business.slug,
        resolved: business.resolved,
        greetingReply: business.resolved
          ? `Good ${business.greetingWord}! You're speaking with ${business.displayName}. How can I help you today?`
          : null,
      },
      embeddingModel: EMBEDDING_MODEL,
      totals: {
        documents: documents.length,
        indexed: documents.filter((d) => d.status === 'indexed').length,
        retrievable: documents.filter((d) => d.retrievable).length,
        chunks: documents.reduce((sum, d) => sum + d.chunkCount, 0),
        embeddedChunks: documents.reduce((sum, d) => sum + d.embeddedChunks, 0),
      },
      documents,
    },
  });
};

export const testKnowledgeQuery = async (req: Request, res: Response): Promise<void> => {
  const { tenantId, role } = resolveScope(req);
  const validated = testQuerySchema.parse(req.body);
  const businessId = validated.businessId || tenantId;
  if (!businessId) {
    throw new ForbiddenError('Tenant scope required');
  }
  if (role !== 'super_admin' && tenantId && tenantId !== businessId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const embedding = await generateEmbedding(validated.query);
  const hits = await searchKnowledgeChunksHybrid(
    embedding,
    validated.query,
    true,
    businessId,
    validated.limit
  );

  const scores = hits.map((hit: any) => (typeof hit.similarity === 'number' ? hit.similarity : 0));
  const maxSimilarity = scores.length ? Math.max(...scores) : null;

  res.json({
    success: true,
    data: {
      query: validated.query,
      businessId,
      hitCount: hits.length,
      maxSimilarity,
      confidence:
        maxSimilarity === null
          ? 'none'
          : maxSimilarity >= 0.3
            ? 'high'
            : maxSimilarity >= 0.1
              ? 'medium'
              : 'low',
      hits: hits.map((hit: any) => ({
        source: hit.source,
        similarity: typeof hit.similarity === 'number' ? hit.similarity : null,
        excerpt: String(hit.chunk_text || '').slice(0, 400),
      })),
    },
  });
};
