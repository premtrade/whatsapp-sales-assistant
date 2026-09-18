import { Request, Response } from 'express';
import { getAuditLogs } from '../services/audit.service';
import { getPagination, getOptionalString } from '../utils/helpers';
import { AuthenticatedRequest } from '../types';

export const listAuditLogs = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;
  const tenantId = (req as AuthenticatedRequest).user?.businessId || (req as AuthenticatedRequest).user?.tenantId;

  const result = await getAuditLogs({
    page,
    limit,
    sortBy,
    sortOrder,
    businessId: tenantId,
    entityType: getOptionalString(query.entityType),
    entityId: getOptionalString(query.entityId),
    action: getOptionalString(query.action),
    performedBy: getOptionalString(query.performedBy),
    performedByType: getOptionalString(query.performedByType),
    startDate: getOptionalString(query.startDate),
    endDate: getOptionalString(query.endDate),
  });

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};
