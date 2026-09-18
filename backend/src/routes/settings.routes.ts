import { Router } from 'express';
import { listSettings, getSetting, updateSettingController, createSettingController, exportSettingsController, importSettingsController } from '../controllers/settings.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { adminRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

// Admin-only routes with admin rate limiting
router.get('/export', adminRateLimiter, exportSettingsController);
router.post('/import', adminRateLimiter, requireRole('admin'), importSettingsController);
router.post('/', adminRateLimiter, requireRole('admin'), createSettingController);
router.put('/', adminRateLimiter, requireRole('admin', 'manager'), updateSettingController);

// Read-only routes (no admin rate limiter needed)
router.get('/', listSettings);
router.get('/:key', getSetting);

export default router;
