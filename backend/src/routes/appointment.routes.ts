import { Router, Request, Response } from 'express';
import { listAppointments, getAppointment, updateAppointmentStatusController } from '../controllers/appointment.controller';
import { authenticate } from '../middleware/auth';
import { sanitizePagination } from '../middleware/validation';

const router = Router();

router.use(authenticate);
router.use(sanitizePagination);

router.get('/', listAppointments);
router.get('/:id', getAppointment);
router.patch('/:id/status', updateAppointmentStatusController);

export default router;
