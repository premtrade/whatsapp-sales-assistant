import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { AppointmentFilters, Appointment } from '../types';
import { emitDashboardStatsUpdated } from '../websocketServer';

function buildWhereClause(filters: AppointmentFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`a.status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.contactId) {
    conditions.push(`a.contact_id = $${paramIndex++}`);
    params.push(filters.contactId);
  }
  if (filters.assignedTo) {
    conditions.push(`a.assigned_to = $${paramIndex++}`);
    params.push(filters.assignedTo);
  }
  if (filters.startDate) {
    conditions.push(`a.starts_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`a.ends_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  const tenantId = filters.businessId || filters.tenantId;
  if (tenantId) {
    conditions.push(`a.business_id = $${paramIndex++}`);
    params.push(tenantId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where: whereClause, params };
}

export async function getAppointments(filters: AppointmentFilters): Promise<{ data: Appointment[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const { where, params } = buildWhereClause(filters);

  const countQuery = `SELECT COUNT(*) as total FROM appointments a ${where}`;
  const countResult = await query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataQuery = `
    SELECT a.id, a.business_id, a.contact_id, a.conversation_id, a.quote_id, a.appointment_type, a.status, a.title, a.description, a.location, a.starts_at, a.ends_at, a.assigned_to, a.reminder_sent, a.metadata, a.created_at, a.updated_at
    FROM appointments a
    ${where}
    ORDER BY a.starts_at ${sortOrder}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query<Appointment>(dataQuery, [...params, limit, offset]);

  return {
    data: dataResult.rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getAppointmentById(id: string, tenantId?: string): Promise<Appointment> {
  let sql = `SELECT id, business_id, contact_id, conversation_id, quote_id, appointment_type, status, title, description, location, starts_at, ends_at, assigned_to, reminder_sent, metadata, created_at, updated_at
     FROM appointments
     WHERE id = $1`;
  const params: unknown[] = [id];

  if (tenantId) {
    sql += ' AND business_id = $2';
    params.push(tenantId);
  }

  const result = await query<Appointment>(sql, params);

  const appointment = result.rows[0];

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  return appointment;
}

export async function updateAppointmentStatus(id: string, status: string, tenantId?: string): Promise<Appointment> {
  const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status: ${status}`);
  }

  let sql = `UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2`;
  const params: unknown[] = [status, id];

  if (tenantId) {
    sql += ' AND business_id = $3';
    params.push(tenantId);
  }

  sql += ' RETURNING id, business_id, contact_id, conversation_id, quote_id, appointment_type, status, title, description, location, starts_at, ends_at, assigned_to, reminder_sent, metadata, created_at, updated_at';

  const result = await query<Appointment>(sql, params);

  const appointment = result.rows[0];

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  // Emit real-time event for dashboard update scoped to tenant
  const emitTenantId = appointment.business_id || tenantId;
  if (emitTenantId) {
    await emitDashboardStatsUpdated(undefined, emitTenantId);
  }

  return appointment;
}
