import { Router } from 'express';
import { getSystemHealthController, getSystemMetricsController, clearSystemCacheController } from '../controllers/systemHealth.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { adminRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/health', getSystemHealthController);
router.get('/metrics', getSystemMetricsController);
router.post('/cache/clear', adminRateLimiter, requireRole('admin'), clearSystemCacheController);

export default router;
