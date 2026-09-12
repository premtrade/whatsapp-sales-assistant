import { Router } from 'express';
import {
  listBusinesses,
  getBusiness,
  getBusinessByPhone,
  createNewBusiness,
  updateExistingBusiness,
  deleteExistingBusiness,
} from '../controllers/business.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', listBusinesses);
router.get('/lookup', getBusinessByPhone);
router.get('/:id', getBusiness);
router.post('/', createNewBusiness);
router.put('/:id', updateExistingBusiness);
router.delete('/:id', deleteExistingBusiness);

export default router;
