import { Router, Request, Response } from 'express';
import { listAuditLogs } from '../controllers/audit.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);
router.use(sanitizePagination);

router.get('/', listAuditLogs);

export default router;
