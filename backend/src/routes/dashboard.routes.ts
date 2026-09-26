import { Router, Request, Response } from 'express';
import { getDashboard } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscription';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/dashboard', getDashboard);

export default router;
