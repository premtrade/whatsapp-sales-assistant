import { Request, Response } from 'express';
import { getSystemHealth, getSystemMetrics } from '../services/systemHealth.service';

export const getSystemHealthController = async (_req: Request, res: Response): Promise<void> => {
  const health = await getSystemHealth();
  res.json({ success: true, data: health });
};

export const getSystemMetricsController = async (_req: Request, res: Response): Promise<void> => {
  const metrics = await getSystemMetrics();
  res.json({ success: true, data: metrics });
};