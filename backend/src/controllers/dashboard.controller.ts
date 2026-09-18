import { Request, Response } from 'express';
import { getDashboardStats } from '../services/dashboard.service';

function getTenantId(req: Request): string {
  const user = (req as any).user;
  const tenantId = user?.businessId || user?.tenantId;
  if (!tenantId) throw new Error('Tenant scope required');
  return tenantId;
}

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const stats = await getDashboardStats(tenantId);

  res.json({
    success: true,
    data: stats,
  });
};