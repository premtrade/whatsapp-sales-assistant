import { Router } from 'express';
import { listDueFollowUps, listFollowUpsByConversation, dispatchFollowUp } from '../controllers/followUp.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/due', listDueFollowUps);
router.get('/conversation/:conversationId', listFollowUpsByConversation);
router.post('/:id/dispatch', dispatchFollowUp);

export default router;
