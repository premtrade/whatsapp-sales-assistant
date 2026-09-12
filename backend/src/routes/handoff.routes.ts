import { Router, Request, Response } from 'express';
import { listHandoffs, listPendingHandoffs, assignHandoffHandler, updateHandoffStatusHandler, getHandoff, createHandoffHandler } from '../controllers/handoff.controller';
import { authenticate } from '../middleware/auth';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(authenticate);
router.use(sanitizePagination);

router.get('/', listHandoffs);
router.get('/pending', listPendingHandoffs);
router.get('/:id', getHandoff);
router.post('/', createHandoffHandler);
router.patch('/:id/assign', assignHandoffHandler);
router.patch('/:id/status', updateHandoffStatusHandler);

export default router;
