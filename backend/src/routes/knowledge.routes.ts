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
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(sanitizePagination);

router.get('/', authenticate, listKnowledgeDocuments);
router.get('/:id', authenticate, getKnowledgeDocument);
router.post('/', authenticate, createKnowledgeDocumentController);
router.post('/upload', authenticate, uploadMiddleware, uploadKnowledgeDocumentController);
router.patch('/:id/status', authenticate, updateKnowledgeStatusController);
router.post('/search/vector', optionalAuth, searchKnowledgeChunks);
router.post('/search/text', optionalAuth, searchKnowledgeChunksText);

export default router;
