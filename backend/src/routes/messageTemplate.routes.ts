import { Router } from 'express';
import { listMessageTemplates, getMessageTemplate, createMessageTemplateController, updateMessageTemplateController, deleteMessageTemplateController } from '../controllers/messageTemplate.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/', listMessageTemplates);
router.get('/:id', getMessageTemplate);
router.post('/', createMessageTemplateController);
router.patch('/:id', updateMessageTemplateController);
router.delete('/:id', deleteMessageTemplateController);

export default router;
