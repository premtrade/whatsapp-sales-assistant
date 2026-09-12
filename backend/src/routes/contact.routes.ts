import { Router, Request, Response } from 'express';
import { listContacts, searchContactsController, getContact, getContactFacts } from '../controllers/contact.controller';
import { authenticate } from '../middleware/auth';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(authenticate);
router.use(sanitizePagination);

router.get('/', listContacts);
router.get('/search', searchContactsController);
router.get('/:id', getContact);
router.get('/:id/facts', getContactFacts);

export default router;
