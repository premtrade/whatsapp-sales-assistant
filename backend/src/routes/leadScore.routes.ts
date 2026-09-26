import { Router } from 'express';
import { listLeadScores, getLeadScore, createLeadScore, updateLeadScore, getLeadPipeline } from '../controllers/leadScore.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);
router.use(sanitizePagination);

router.get('/', listLeadScores);
router.get('/pipeline', getLeadPipeline);
router.get('/:id', getLeadScore);
router.post('/', createLeadScore);
router.patch('/:id', updateLeadScore);

export default router;
