import { Router } from 'express';
import { listStaffUsers, getStaffUser, createNewStaffUser, updateExistingStaffUser, updateStaffUserStatus, deleteStaffUser } from '../controllers/staff.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';
import { sanitizePagination } from '../middleware/validation';
import { adminRateLimiter } from '../middleware/rateLimiter';
import { acceptInvitation } from '../services/staff.service';
import { BadRequestError } from '../utils/errors';
import { z } from 'zod';

const router = Router();

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

router.post('/accept-invite', async (req, res): Promise<void> => {
  const validated = acceptInviteSchema.parse(req.body);
  const user = await acceptInvitation(validated.token, validated.password);
  res.json({ success: true, data: user });
});

router.use(authenticate);
router.use(requireActiveSubscription);
router.use(sanitizePagination);

// Admin-only routes with admin rate limiting.
// `super_admin` is included so the platform owner can manage staff, and the
// `/users/*` aliases match the paths used by the dashboard client.
const canManageStaff = requireRole('admin', 'super_admin');
const canEditStaff = requireRole('admin', 'manager', 'super_admin');
router.post('/', adminRateLimiter, canManageStaff, createNewStaffUser);
router.post('/users', adminRateLimiter, canManageStaff, createNewStaffUser);
router.put('/users/:id', adminRateLimiter, canEditStaff, updateExistingStaffUser);
router.put('/:id', adminRateLimiter, canEditStaff, updateExistingStaffUser);
router.patch('/users/:id/status', adminRateLimiter, canManageStaff, updateStaffUserStatus);
router.patch('/:id/status', adminRateLimiter, canManageStaff, updateStaffUserStatus);
router.delete('/users/:id', adminRateLimiter, canManageStaff, deleteStaffUser);
router.delete('/:id', adminRateLimiter, canManageStaff, deleteStaffUser);

// Read-only routes (no admin rate limiter needed)
router.get('/', listStaffUsers);
router.get('/users', listStaffUsers);
router.get('/users/:id', getStaffUser);
router.get('/:id', getStaffUser);

export default router;
