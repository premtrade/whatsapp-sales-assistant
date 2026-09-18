import { Request, Response } from 'express';
import { getConversations, updateConversationStatus, getConversationById, getConversationMessages } from '../services/conversation.service';
import { BadRequestError } from '../utils/errors';
import { getPagination, getOptionalString } from '../utils/helpers';
import logger from '../utils/logger';
import { createAuditLog } from '../services/audit.service';
import { AuthenticatedRequest, UserPayload } from '../types';
import { query } from '../utils/database';

const updateStatusSchema = (data: unknown) => {
  const validStatuses = ['active', 'waiting_customer', 'waiting_agent', 'closed', 'archived'];
  const parsed = data as { status?: string };
  if (!parsed.status || !validStatuses.includes(parsed.status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
  return parsed;
};

export const listConversations = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const tenantId = (req as AuthenticatedRequest).user?.businessId || (req as AuthenticatedRequest).user?.tenantId;

  const result = await getConversations({
    page,
    limit,
    sortBy,
    sortOrder,
    businessId: tenantId,
    status: getOptionalString(req.query.status),
    channel: getOptionalString(req.query.channel),
    contactId: getOptionalString(req.query.contactId),
    assignedTo: getOptionalString(req.query.assignedTo),
    search: getOptionalString(req.query.search),
    startDate: getOptionalString(req.query.startDate),
    endDate: getOptionalString(req.query.endDate),
  });

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};

export const getConversation = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as AuthenticatedRequest).user?.businessId || (req as AuthenticatedRequest).user?.tenantId;
  const conversation = await getConversationById(req.params.id!, tenantId);
  const messages = await getConversationMessages(req.params.id!, 50, 0, tenantId);

  const handoffResult = await query<{ id: string; reason: string; assigned_to: string | null; status: string }>(
    `SELECT id, reason, assigned_to, status
     FROM handoffs
     WHERE conversation_id = $1 AND status IN ('pending', 'accepted')
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.params.id!]
  );
  const activeHandoff = handoffResult.rows[0] || null;

  const contactId = conversation.contact_id;

  const [factsResult, upcomingAppointmentsResult, recentQuotesResult] = await Promise.all([
    query<{ fact_key: string; fact_value: string; confidence: number }>(
      `SELECT fact_key, fact_value, confidence
       FROM customer_facts
       WHERE contact_id = $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [contactId]
    ),
    query(
      `SELECT id, appointment_type, status, title, starts_at, ends_at
       FROM appointments
       WHERE contact_id = $1 AND status IN ('scheduled', 'confirmed')
       ORDER BY starts_at ASC
       LIMIT 2`,
      [contactId]
    ),
    query(
      `SELECT id, quote_number, status, subtotal, tax, discount, total, currency, valid_until
       FROM quotes
       WHERE contact_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [contactId]
    ),
  ]);

  res.json({
    success: true,
    data: {
      ...conversation,
      messages,
      active_handoff: activeHandoff,
      customer_facts: factsResult.rows,
      upcoming_appointments: upcomingAppointmentsResult.rows,
      recent_quotes: recentQuotesResult.rows,
    },
  });
};

export const updateConversationStatusController = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as AuthenticatedRequest).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  const tenantId = currentUser.businessId || currentUser.tenantId;
  const validated = updateStatusSchema(req.body) as { status: string };
  const conversation = await updateConversationStatus(req.params.id!, validated.status, currentUser.id, tenantId);


  await createAuditLog(
    'conversations',
    'update_status',
    currentUser.id,
    'staff',
    `Conversation status updated to ${validated.status}`,
    undefined,
    { status: validated.status },
    { conversationId: req.params.id! },
    req.ip!,
    req.get('user-agent')!
  );

  logger.info('Conversation status updated via API', { conversationId: req.params.id!, userId: currentUser.id });

  res.json({
    success: true,
    data: conversation,
    message: 'Conversation status updated',
  });
};
