import { Request, Response } from 'express';
import { getAuditLogs } from '../services/audit.service';
import { getPagination, getOptionalString } from '../utils/helpers';

export const listAuditLogs = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;

  const result = await getAuditLogs({
    page,
    limit,
    sortBy,
    sortOrder,
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
