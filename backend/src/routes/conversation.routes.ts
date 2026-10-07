import { Router, Request, Response } from 'express';
import { listConversations, getConversation, updateConversationStatusController } from '../controllers/conversation.controller';
import { authenticate } from '../middleware/auth';
import { requireEntitlement } from '../middleware/entitlement';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(authenticate, requireEntitlement);
router.use(sanitizePagination);

router.get('/', listConversations);
router.get('/:id', getConversation);
router.patch('/:id/status', updateConversationStatusController);

export default router;
