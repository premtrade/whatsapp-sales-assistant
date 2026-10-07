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
import { requireEntitlement } from '../middleware/entitlement';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(sanitizePagination);

router.get('/', authenticate, requireEntitlement, listKnowledgeDocuments);
router.get('/:id', authenticate, requireEntitlement, getKnowledgeDocument);
router.post('/', authenticate, requireEntitlement, createKnowledgeDocumentController);
router.post('/upload', authenticate, requireEntitlement, uploadMiddleware, uploadKnowledgeDocumentController);
router.patch('/:id/status', authenticate, requireEntitlement, updateKnowledgeStatusController);
router.post('/search/vector', optionalAuth, searchKnowledgeChunks);
router.post('/search/text', optionalAuth, searchKnowledgeChunksText);

export default router;
