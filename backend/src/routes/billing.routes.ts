import { Router, Response } from 'express';
import { getBillingMetrics, getRevenueTimeSeries, getUsageByMetric } from '../services/billing.service';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.get('/metrics', authenticate, requireRole('super_admin'), async (_req, res: Response): Promise<void> => {
  const metrics = await getBillingMetrics();
  res.json({ success: true, data: metrics });
});

router.get('/revenue', authenticate, requireRole('super_admin'), async (req, res: Response): Promise<void> => {
  const days = parseInt(req.query.days as string) || 30;
  const timeSeries = await getRevenueTimeSeries(days);
  res.json({ success: true, data: timeSeries });
});

router.get('/usage', authenticate, requireRole('super_admin'), async (_req, res: Response): Promise<void> => {
  const usage = await getUsageByMetric();
  res.json({ success: true, data: usage });
});

export default router;
