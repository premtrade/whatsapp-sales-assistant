import { Request, Response } from 'express';
import { getDashboardStats } from '../services/dashboard.service';

export const getDashboard = async (_req: Request, res: Response): Promise<void> => {
  const stats = await getDashboardStats();

  res.json({
    success: true,
    data: stats,
  });
};
