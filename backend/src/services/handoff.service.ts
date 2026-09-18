import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { HandoffFilters, Handoff } from '../types';
import logger from '../utils/logger';
import { emitHandoffCreated, emitHandoffUpdated, emitDashboardStatsUpdated } from '../websocketServer';

export interface HandoffWithDetails extends Handoff {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  assignedStaffName?: string;
  assignedStaffEmail?: string;
}

interface HandoffRow {
  id: string;
  business_id: string;
  conversation_id: string;
  assigned_to?: string;
  requested_by: string;
  reason: string;
  notes?: string;
  status: string;
  accepted_at?: Date;
  completed_at?: Date;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  contact_name?: string;
  contact_phone?: string;
  staff_first_name?: string;
  staff_last_name?: string;
  staff_email?: string;
}

function buildWhereClause(filters: HandoffFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`h.status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.conversationId) {
    conditions.push(`h.conversation_id = $${paramIndex++}`);
    params.push(filters.conversationId);
  }
  if (filters.assignedTo) {
    conditions.push(`h.assigned_to = $${paramIndex++}`);
    params.push(filters.assignedTo);
  }
  if (filters.requestedBy) {
    conditions.push(`h.requested_by = $${paramIndex++}`);
    params.push(filters.requestedBy);
  }

  const tenantId = filters.businessId || filters.tenantId;
  if (tenantId) {
    conditions.push(`h.business_id = $${paramIndex++}`);
    params.push(tenantId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where: whereClause, params };
}

export async function getHandoffs(filters: HandoffFilters): Promise<{ data: HandoffWithDetails[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const { where, params } = buildWhereClause(filters);

  const countQuery = `SELECT COUNT(*) as total FROM handoffs h ${where}`;
  const countResult = await query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataQuery = `
    SELECT 
      h.id, h.business_id, h.conversation_id, h.assigned_to, h.requested_by, h.reason, h.notes, h.status, h.accepted_at, h.completed_at, h.metadata, h.created_at, h.updated_at,
      ct.display_name as contact_name, ct.phone as contact_phone,
      su.first_name as staff_first_name, su.last_name as staff_last_name, su.email as staff_email
    FROM handoffs h
    JOIN conversations c ON h.conversation_id = c.id
    JOIN contacts ct ON c.contact_id = ct.id
    LEFT JOIN staff_users su ON h.assigned_to = su.id
    ${where}
    ORDER BY h.created_at ${sortOrder}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query<HandoffRow>(dataQuery, [...params, limit, offset]);

  const data: HandoffWithDetails[] = dataResult.rows.map((row) => ({
    id: row.id,
    business_id: row.business_id,
    conversation_id: row.conversation_id,
    assigned_to: row.assigned_to,
    requested_by: row.requested_by,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    accepted_at: row.accepted_at,
    completed_at: row.completed_at,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    conversationId: row.conversation_id,
    contactName: row.contact_name || '',
    contactPhone: row.contact_phone || '',
    assignedStaffName: row.assigned_to && row.staff_first_name && row.staff_last_name ? `${row.staff_first_name} ${row.staff_last_name}` : undefined,
    assignedStaffEmail: row.staff_email,
  }));

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getPendingHandoffs(limit = 50, tenantId?: string): Promise<HandoffWithDetails[]> {
  let sql = `
    SELECT 
      h.id, h.business_id, h.conversation_id, h.assigned_to, h.requested_by, h.reason, h.notes, h.status, h.accepted_at, h.completed_at, h.metadata, h.created_at, h.updated_at,
      ct.display_name as contact_name, ct.phone as contact_phone,
      su.first_name as staff_first_name, su.last_name as staff_last_name, su.email as staff_email
     FROM handoffs h
     JOIN conversations c ON h.conversation_id = c.id
     JOIN contacts ct ON c.contact_id = ct.id
     LEFT JOIN staff_users su ON h.assigned_to = su.id
     WHERE h.status = 'pending'`;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (tenantId) {
    sql += ` AND h.business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` ORDER BY h.created_at ASC LIMIT $${paramIndex}`;

  const result = await query<HandoffRow>(sql, [...params, limit]);

  return result.rows.map((row) => ({
    id: row.id,
    business_id: row.business_id,
    conversation_id: row.conversation_id,
    assigned_to: row.assigned_to,
    requested_by: row.requested_by,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    accepted_at: row.accepted_at,
    completed_at: row.completed_at,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    conversationId: row.conversation_id,
    contactName: row.contact_name || '',
    contactPhone: row.contact_phone || '',
    assignedStaffName: row.assigned_to && row.staff_first_name && row.staff_last_name ? `${row.staff_first_name} ${row.staff_last_name}` : undefined,
    assignedStaffEmail: row.staff_email,
  }));
}

export async function getHandoffById(id: string, tenantId?: string): Promise<Handoff> {
  let sql = `SELECT id, business_id, conversation_id, assigned_to, requested_by, reason, notes, status, accepted_at, completed_at, metadata, created_at, updated_at
      FROM handoffs
      WHERE id = $1`;
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  const result = await query<Handoff>(sql, params);

  const handoff = result.rows[0];

  if (!handoff) {
    throw new NotFoundError('Handoff not found');
  }

  return handoff;
}

export async function assignHandoff(id: string, staffId: string, userId: string, tenantId: string): Promise<Handoff> {
  const result = await query<Handoff>(
    `UPDATE handoffs
     SET assigned_to = $1, updated_at = NOW()
     WHERE id = $2 AND business_id = $3
     RETURNING id, business_id, conversation_id, assigned_to, requested_by, reason, notes, status, accepted_at, completed_at, metadata, created_at, updated_at`,
    [staffId, id, tenantId]
  );

  const handoff = result.rows[0];

  if (!handoff) {
    throw new NotFoundError('Handoff not found');
  }

  logger.info('Handoff assigned', { handoffId: id, staffId, userId, tenantId });

  // Emit real-time events with tenantId
  const emitTenantId = handoff.business_id || tenantId;
  if (emitTenantId) {
    await emitHandoffUpdated(handoff, emitTenantId);
    await emitDashboardStatsUpdated(undefined, emitTenantId);
  }

  return handoff;
}

export async function updateHandoffStatus(
  id: string,
  status: 'pending' | 'accepted' | 'completed' | 'cancelled',
  userId: string,
  tenantId: string
): Promise<Handoff> {
  const validStatuses = ['pending', 'accepted', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status: ${status}`);
  }

  let acceptedAt = undefined;
  let completedAt = undefined;

  if (status === 'accepted') {
    acceptedAt = new Date().toISOString();
  } else if (status === 'completed') {
    completedAt = new Date().toISOString();
  }

  const result = await query<Handoff>(
    `UPDATE handoffs
     SET status = $1, accepted_at = COALESCE($2, accepted_at), completed_at = COALESCE($3, completed_at), updated_at = NOW()
     WHERE id = $4 AND business_id = $5
     RETURNING id, business_id, conversation_id, assigned_to, requested_by, reason, notes, status, accepted_at, completed_at, metadata, created_at, updated_at`,
    [status, acceptedAt, completedAt, id, tenantId]
  );

  const handoff = result.rows[0];

  if (!handoff) {
    throw new NotFoundError('Handoff not found');
  }

  logger.info('Handoff status updated', { handoffId: id, newStatus: status, userId, tenantId });

  // Emit real-time events with tenantId
  const emitTenantId = handoff.business_id || tenantId;
  if (emitTenantId) {
    await emitHandoffUpdated(handoff, emitTenantId);
    await emitDashboardStatsUpdated(undefined, emitTenantId);
  }

  return handoff;
}

export async function createHandoff(data: {
  conversationId: string;
  requestedBy: string;
  reason: string;
  notes?: string;
}, tenantId: string): Promise<Handoff> {
  const result = await query<Handoff>(
    `INSERT INTO handoffs (conversation_id, requested_by, reason, notes, status, business_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, NOW(), NOW())
     RETURNING id, business_id, conversation_id, assigned_to, requested_by, reason, notes, status, accepted_at, completed_at, metadata, created_at, updated_at`,
    [data.conversationId, data.requestedBy, data.reason, data.notes || null, tenantId]
  );

  const handoff = result.rows[0];

  if (!handoff) {
    throw new NotFoundError('Failed to create handoff');
  }

  logger.info('Handoff created', { handoffId: handoff.id, conversationId: data.conversationId, tenantId });

  // Emit real-time events with tenantId
  const emitTenantId = handoff.business_id || tenantId;
  if (emitTenantId) {
    await emitHandoffCreated(handoff, emitTenantId);
    await emitDashboardStatsUpdated(undefined, emitTenantId);
  }

  return handoff;
}