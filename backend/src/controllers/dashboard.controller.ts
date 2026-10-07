import { Request, Response } from 'express';
import { getDashboardStats } from '../services/dashboard.service';
import { UserPayload } from '../types';

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as Request & { user?: UserPayload }).user?.businessId;
  if (!businessId) {
    throw new Error('Missing workspace context for dashboard');
  }
  const stats = await getDashboardStats(businessId);

  res.json({
    success: true,
    data: stats,
  });
};
