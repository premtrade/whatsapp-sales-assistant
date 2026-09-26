import { Router } from 'express';
import { listConversationNotes, addConversationNote, removeConversationNote } from '../controllers/conversationNote.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/:conversationId/notes', listConversationNotes);
router.post('/:conversationId/notes', addConversationNote);
router.delete('/:conversationId/notes/:noteId', removeConversationNote);

export default router;
