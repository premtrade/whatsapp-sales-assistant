import { Request, Response } from 'express';
import { getQuotes, getQuoteWithDetails, updateQuoteStatus } from '../services/quote.service';
import { BadRequestError } from '../utils/errors';
import { getPagination, getOptionalString } from '../utils/helpers';
import { createAuditLog } from '../services/audit.service';
import { UserPayload } from '../types';

const updateStatusSchema = (data: unknown) => {
  const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'];
  const parsed = data as { status?: string };
  if (!parsed.status || !validStatuses.includes(parsed.status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
  return parsed;
};

export const listQuotes = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;
  const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;

  const result = await getQuotes({
    page,
    limit,
    sortBy,
    sortOrder,
    businessId: tenantId,
    status: getOptionalString(query.status),
    contactId: getOptionalString(query.contactId),
    conversationId: getOptionalString(query.conversationId),
    search: getOptionalString(query.search),
  });

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};

export const getQuote = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as Request & { user?: UserPayload }).user?.businessId || (req as Request & { user?: UserPayload }).user?.tenantId;
  const quote = await getQuoteWithDetails(req.params.id!, tenantId);

  res.json({
    success: true,
    data: quote,
  });
};

export const updateQuoteStatusController = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  const tenantId = currentUser.businessId || currentUser.tenantId;
  const validated = updateStatusSchema(req.body) as { status: string };
  const quote = await updateQuoteStatus(req.params.id!, validated.status, tenantId);

  await createAuditLog(
    'quotes',
    'update_status',
    currentUser.id,
    'staff',
    `Quote status updated to ${validated.status}`,
    undefined,
    { status: validated.status },
    { quoteId: req.params.id! },
    req.ip!,
    req.get('user-agent')!,
    tenantId
  );

  res.json({
    success: true,
    data: quote,
    message: 'Quote status updated',
  });
};
