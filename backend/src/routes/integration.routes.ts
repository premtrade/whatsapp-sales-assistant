import { Router } from 'express';
import { getCrmConfig, updateCrmConfig, testCrmConfig } from '../controllers/integration.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { adminRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

// Read-only: any authenticated staff member can see integration status.
router.get('/crm', getCrmConfig);

// Mutations are admin-only (they store credentials / toggle sync).
router.put('/crm', adminRateLimiter, requireRole('admin'), updateCrmConfig);
router.post('/crm/test', adminRateLimiter, requireRole('admin'), testCrmConfig);

export default router;
