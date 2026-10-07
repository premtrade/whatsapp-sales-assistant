import { Router, Request, Response } from 'express';
import { getMessagesController, replyToConversation } from '../controllers/message.controller';
import { authenticate } from '../middleware/auth';
import { requireEntitlement } from '../middleware/entitlement';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(authenticate, requireEntitlement);
router.use(sanitizePagination);

router.get('/:conversationId', getMessagesController);
router.post('/:conversationId/reply', replyToConversation);

export default router;
