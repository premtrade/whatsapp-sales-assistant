import { Router, Response } from 'express';
import { getOwnerDashboardStats, getFinancialMetrics, getConversionMetrics } from '../services/owner.service';
import { authenticate, requireOwnerAccess } from '../middleware/auth';

const router = Router();

router.get('/dashboard', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  const stats = await getOwnerDashboardStats();
  res.json({ success: true, data: stats });
});

router.get('/financials', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  const metrics = await getFinancialMetrics();
  res.json({ success: true, data: metrics });
});

router.get('/conversion-metrics', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  const metrics = await getConversionMetrics();
  res.json({ success: true, data: metrics });
});

export default router;
