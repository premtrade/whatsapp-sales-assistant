import { Router } from 'express';
import { listStaffUsers, getStaffUser, createNewStaffUser, updateExistingStaffUser, updateStaffUserStatus } from '../controllers/staff.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(authenticate);
router.use(sanitizePagination);

router.get('/users', listStaffUsers);
router.get('/users/:id', getStaffUser);
router.post('/users', requireRole('admin'), createNewStaffUser);
router.put('/users/:id', requireRole('admin', 'manager'), updateExistingStaffUser);
router.patch('/users/:id/status', requireRole('admin'), updateStaffUserStatus);

export default router;
