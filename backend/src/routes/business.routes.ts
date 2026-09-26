import { Router } from 'express';
import {
  listBusinesses,
  getBusiness,
  getBusinessByPhone,
  createNewBusiness,
  updateExistingBusiness,
  deleteExistingBusiness,
} from '../controllers/business.controller';
import { seedDemoBusiness } from '../services/demo.service';
import { authenticate, requireRole } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { BadRequestError } from '../utils/errors';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/', listBusinesses);
router.get('/lookup', getBusinessByPhone);
router.get('/:id', getBusiness);
router.post('/', createNewBusiness);
router.put('/:id', updateExistingBusiness);
router.delete('/:id', deleteExistingBusiness);

router.post('/demo/seed', requireRole('super_admin'), async (req, res): Promise<void> => {
  try {
    const result = await seedDemoBusiness(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Failed to seed demo business' });
  }
});

export default router;
