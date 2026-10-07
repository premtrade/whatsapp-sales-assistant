import { Router, Request, Response } from 'express';
import { getDashboard } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';
import { requireEntitlement } from '../middleware/entitlement';

const router = Router();

router.use(authenticate, requireEntitlement);

router.get('/dashboard', getDashboard);

export default router;
