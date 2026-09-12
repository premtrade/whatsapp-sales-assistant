import { Router } from 'express';
import { listSettings, getSetting, updateSettingController, createSettingController } from '../controllers/settings.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', listSettings);
router.get('/:key', getSetting);
router.post('/', requireRole('admin'), createSettingController);
router.put('/', requireRole('admin', 'manager'), updateSettingController);

export default router;
