import { Router } from 'express';
import { listQuickReplies, addQuickReply, editQuickReply, removeQuickReply } from '../controllers/quickReply.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', listQuickReplies);
router.post('/', addQuickReply);
router.patch('/:id', editQuickReply);
router.delete('/:id', removeQuickReply);

export default router;
