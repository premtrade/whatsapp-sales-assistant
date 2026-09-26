import { Router, Response } from 'express';
import { getOwnerDashboardStats, getFinancialMetrics } from '../services/owner.service';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.get('/dashboard', authenticate, requireRole('super_admin'), async (_req, res: Response): Promise<void> => {
  const stats = await getOwnerDashboardStats();
  res.json({ success: true, data: stats });
});

router.get('/financials', authenticate, requireRole('super_admin'), async (_req, res: Response): Promise<void> => {
  const metrics = await getFinancialMetrics();
  res.json({ success: true, data: metrics });
});

export default router;
