import { Router, Request, Response } from 'express';
import {
  listKnowledgeDocuments,
  getKnowledgeDocument,
  createKnowledgeDocumentController,
  updateKnowledgeStatusController,
  searchKnowledgeChunks,
  searchKnowledgeChunksText,
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
router.get('/:id', authenticate, requireActiveSubscription, getKnowledgeDocument);
router.post('/', authenticate, requireActiveSubscription, createKnowledgeDocumentController);
router.post('/upload', authenticate, requireActiveSubscription, uploadMiddleware, uploadKnowledgeDocumentController);
router.patch('/:id/status', authenticate, requireActiveSubscription, updateKnowledgeStatusController);
router.post('/search/vector', optionalAuth, searchKnowledgeChunks);
router.post('/search/text', optionalAuth, searchKnowledgeChunksText);

export default router;
