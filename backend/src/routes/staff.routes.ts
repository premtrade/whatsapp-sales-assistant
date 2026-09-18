import { Router } from 'express';
import { listStaffUsers, getStaffUser, createNewStaffUser, updateExistingStaffUser, updateStaffUserStatus, deleteStaffUser } from '../controllers/staff.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { sanitizePagination } from '../middleware/validation';
import { adminRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);
router.use(sanitizePagination);

// Admin-only routes with admin rate limiting
router.post('/', adminRateLimiter, requireRole('admin'), createNewStaffUser);
  router.put('/:id', adminRateLimiter, requireRole('admin', 'manager'), updateExistingStaffUser);
  router.patch('/:id/status', adminRateLimiter, requireRole('admin'), updateStaffUserStatus);
  router.delete('/:id', adminRateLimiter, requireRole('admin'), deleteStaffUser);

// Read-only routes (no admin rate limiter needed)
router.get('/', listStaffUsers);
router.get('/:id', getStaffUser);

export default router;
