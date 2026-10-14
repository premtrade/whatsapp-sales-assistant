import { Router, Request, Response } from 'express';
import {
  listKnowledgeDocuments,
  getKnowledgeDocument,
  getKnowledgeDocumentChunks,
  createKnowledgeDocumentController,
  updateKnowledgeDocumentController,
  deleteKnowledgeDocumentController,
  updateKnowledgeStatusController,
  reindexKnowledgeDocumentController,
  searchKnowledgeChunks,
  searchKnowledgeChunksText,
  hybridSearchKnowledge,
  embedText,
  uploadKnowledgeDocumentController,
  uploadMiddleware,
} from '../controllers/knowledge.controller';
import { authenticate, optionalAuth } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(sanitizePagination);

// Authenticated routes require a usable subscription; optionalAuth search
// endpoints stay ungated so unauthenticated/n8n callers are unaffected.
router.get('/', authenticate, requireActiveSubscription, listKnowledgeDocuments);
// Static sub-paths must come before '/:id' — Express matches top-down, so
// '/:id' would otherwise swallow '/:id/chunks' and 404 on the wrong handler.
router.get('/:id/chunks', authenticate, requireActiveSubscription, getKnowledgeDocumentChunks);
router.get('/:id', authenticate, requireActiveSubscription, getKnowledgeDocument);
router.post('/', authenticate, requireActiveSubscription, createKnowledgeDocumentController);
router.post('/upload', authenticate, requireActiveSubscription, uploadMiddleware, uploadKnowledgeDocumentController);
// Re-index request: original files are not stored, so re-indexing requires a
// re-upload. This validates the document exists and returns that instruction.
router.post('/:id/reindex', authenticate, requireActiveSubscription, reindexKnowledgeDocumentController);
router.patch('/:id/status', authenticate, requireActiveSubscription, updateKnowledgeStatusController);
router.patch('/:id', authenticate, requireActiveSubscription, updateKnowledgeDocumentController);
router.delete('/:id', authenticate, requireActiveSubscription, deleteKnowledgeDocumentController);
router.post('/search/vector', optionalAuth, searchKnowledgeChunks);
router.post('/search/text', optionalAuth, searchKnowledgeChunksText);
// Hybrid search: runs the semantic + trigram SQL server-side. n8n calls this
// instead of raw SQL because its Postgres node splits queryReplacement on
// commas, which shatters a 768-dim vector ("[0.1,0.2,...]") into fragments.
router.post('/search/hybrid', optionalAuth, hybridSearchKnowledge);
// Internal: used by n8n to embed the incoming message with the same local model
// that indexes documents, so vector search is consistent. optionalAuth so the
// n8n caller on the internal network is unaffected.
router.post('/embed', optionalAuth, embedText);

export default router;
