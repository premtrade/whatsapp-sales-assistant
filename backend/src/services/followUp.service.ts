import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

export interface FollowUp {
  id: string;
  business_id: string;
  conversation_id: string;
  contact_id: string;
  template_key: string;
  scheduled_at: string;
  status: string;
  sent_at?: string;
  attempts: number;
  max_attempts: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateFollowUpInput {
  conversationId: string;
  contactId: string;
  templateKey: string;
  scheduledAt: string;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
}

export async function createFollowUp(input: CreateFollowUpInput, tenantId: string): Promise<FollowUp> {
  const result = await query<FollowUp>(
    `INSERT INTO follow_up_queue (conversation_id, contact_id, template_key, scheduled_at, max_attempts, metadata, business_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, business_id, conversation_id, contact_id, template_key, scheduled_at, status, sent_at, attempts, max_attempts, metadata, created_at, updated_at`,
    [
      input.conversationId,
      input.contactId,
      input.templateKey,
      input.scheduledAt,
      input.maxAttempts || 3,
      input.metadata || {},
      tenantId,
    ]
  );

  const followUp = result.rows[0];
  if (!followUp) throw new NotFoundError('Follow-up not found');

  logger.info('Follow-up created', { followUpId: followUp.id, conversationId: input.conversationId, template: input.templateKey, tenantId });

  return followUp;
}

export async function getDueFollowUps(limit = 50, tenantId?: string): Promise<FollowUp[]> {
  let sql = `
    SELECT id, business_id, conversation_id, contact_id, template_key, scheduled_at, status, sent_at, attempts, max_attempts, metadata, created_at, updated_at
    FROM follow_up_queue
    WHERE status = 'pending' AND scheduled_at <= NOW() AND attempts < max_attempts
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` ORDER BY scheduled_at ASC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await query<FollowUp>(sql, params);
  return result.rows;
}

export async function getFollowUpsByConversation(conversationId: string, tenantId?: string): Promise<FollowUp[]> {
  let sql = `
    SELECT id, business_id, conversation_id, contact_id, template_key, scheduled_at, status, sent_at, attempts, max_attempts, metadata, created_at, updated_at
    FROM follow_up_queue
    WHERE conversation_id = $1
  `;
  const params: unknown[] = [conversationId];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` ORDER BY scheduled_at DESC`;

  const result = await query<FollowUp>(sql, params);
  return result.rows;
}

export async function markFollowUpSent(id: string, tenantId?: string): Promise<FollowUp> {
  let sql = `
    UPDATE follow_up_queue
    SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, updated_at = NOW()
    WHERE id = $1
  `;
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` RETURNING id, business_id, conversation_id, contact_id, template_key, scheduled_at, status, sent_at, attempts, max_attempts, metadata, created_at, updated_at`;

  const result = await query<FollowUp>(sql, params);
  const followUp = result.rows[0];
  if (!followUp) throw new NotFoundError('Follow-up not found');

  logger.info('Follow-up marked as sent', { followUpId: id, tenantId });

  return followUp;
}

export async function markFollowUpFailed(id: string, tenantId?: string): Promise<FollowUp> {
  let sql = `
    UPDATE follow_up_queue
    SET status = 'failed', attempts = attempts + 1, updated_at = NOW()
    WHERE id = $1
  `;
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` RETURNING id, business_id, conversation_id, contact_id, template_key, scheduled_at, status, sent_at, attempts, max_attempts, metadata, created_at, updated_at`;

  const result = await query<FollowUp>(sql, params);
  const followUp = result.rows[0];
  if (!followUp) throw new NotFoundError('Follow-up not found');

  logger.warn('Follow-up marked as failed', { followUpId: id, attempts: followUp.attempts, tenantId });

  return followUp;
}

export async function cancelFollowUp(id: string, tenantId?: string): Promise<FollowUp> {
  let sql = `
    UPDATE follow_up_queue
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1
  `;
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` RETURNING id, business_id, conversation_id, contact_id, template_key, scheduled_at, status, sent_at, attempts, max_attempts, metadata, created_at, updated_at`;

  const result = await query<FollowUp>(sql, params);
  const followUp = result.rows[0];
  if (!followUp) throw new NotFoundError('Follow-up not found');

  logger.info('Follow-up cancelled', { followUpId: id, tenantId });

  return followUp;
}

export async function detectAbandonedConversations(hoursThreshold = 24): Promise<{ conversation_id: string; contact_id: string; last_message_at: string }[]> {
  const result = await query<{ conversation_id: string; contact_id: string; last_message_at: string }>(
    `SELECT c.id as conversation_id, c.contact_id, c.last_message_at
     FROM conversations c
     WHERE c.status = 'active'
       AND c.last_message_at <= NOW() - INTERVAL '${hoursThreshold} hours'
       AND NOT EXISTS (
         SELECT 1 FROM handoffs h WHERE h.conversation_id = c.id AND h.status IN ('pending', 'accepted')
       )
     ORDER BY c.last_message_at ASC`,
    []
  );

  return result.rows;
}
