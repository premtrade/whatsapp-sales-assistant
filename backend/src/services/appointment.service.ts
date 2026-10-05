import { query, transaction } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { AppointmentFilters, Appointment } from '../types';
import { emitDashboardStatsUpdated } from '../websocketServer';
import { PoolClient } from 'pg';

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

export interface BookAppointmentInput {
  businessId: string;
  contactId: string;
  conversationId: string;
  preferredDate: string;
  preferredTime: string;
  durationMinutes: number;
  appointmentType: Appointment['appointment_type'];
  title: string;
  location?: string | null;
  description?: string | null;
  assignedTo?: string;
}

export interface BookedAppointmentDetails {
  appointment: Appointment;
  businessName: string;
  timezone: string;
  wahaSession: string | null;
  customerName: string;
  customerPhone: string;
  assignedName: string | null;
  assignedPhone: string | null;
}

export async function bookAppointment(input: BookAppointmentInput): Promise<BookedAppointmentDetails> {
  return transaction(async (client: PoolClient) => {
    const businessResult = await client.query<{
      business_name: string;
      timezone: string;
      waha_session_name: string | null;
      contact_name: string;
      contact_phone: string;
    }>(
      `SELECT b.name AS business_name, b.timezone, b.waha_session_name,
              c.display_name AS contact_name, c.phone AS contact_phone
       FROM businesses b
       JOIN contacts c ON c.business_id = b.id
       WHERE b.id = $1 AND c.id = $2 AND b.status IN ('active', 'trialing')
       FOR UPDATE OF c`,
      [input.businessId, input.contactId]
    );
    const business = businessResult.rows[0];
    if (!business) throw new NotFoundError('Business or contact not found');

    const conversationResult = await client.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND business_id = $2 AND contact_id = $3`,
      [input.conversationId, input.businessId, input.contactId]
    );
    if (!conversationResult.rows[0]) throw new BadRequestError('Conversation does not belong to this contact and business');

    const timeResult = await client.query<{ starts_at: Date; ends_at: Date }>(
      `SELECT (($1::date + $2::time) AT TIME ZONE $3) AS starts_at,
              (($1::date + $2::time) AT TIME ZONE $3) + make_interval(mins => $4) AS ends_at`,
      [input.preferredDate, input.preferredTime, business.timezone || 'UTC', input.durationMinutes]
    );
    const resolvedTime = timeResult.rows[0];
    if (!resolvedTime) throw new BadRequestError('Appointment time could not be resolved');
    const { starts_at: startsAt, ends_at: endsAt } = resolvedTime;
    if (!startsAt || startsAt.getTime() <= Date.now()) throw new BadRequestError('Appointment time must be in the future');

    let assignedTo = input.assignedTo || null;
    if (assignedTo) {
      const assignedResult = await client.query(
        `SELECT id FROM staff_users
         WHERE id = $1 AND business_id = $2 AND status = 'active' AND deleted_at IS NULL
         FOR UPDATE`,
        [assignedTo, input.businessId]
      );
      if (!assignedResult.rows[0]) throw new BadRequestError('Assigned staff member is not active in this business');
    } else {
      const defaultAssignee = await client.query(
        `SELECT id FROM staff_users
         WHERE business_id = $1 AND status = 'active' AND deleted_at IS NULL
         ORDER BY (role = 'admin') DESC, created_at ASC
         LIMIT 1 FOR UPDATE`,
        [input.businessId]
      );
      assignedTo = defaultAssignee.rows[0]?.id || null;
    }

    const conflict = await client.query(
      `SELECT id FROM appointments
       WHERE business_id = $1 AND status IN ('scheduled', 'confirmed')
         AND starts_at < $3 AND ends_at > $2
         AND (contact_id = $4 OR ($5::uuid IS NOT NULL AND assigned_to = $5::uuid))
       LIMIT 1`,
      [input.businessId, startsAt, endsAt, input.contactId, assignedTo]
    );
    if (conflict.rows[0]) throw new BadRequestError('The customer or assigned staff member already has an appointment at that time');

    const appointmentResult = await client.query<Appointment>(
      `INSERT INTO appointments
         (business_id, contact_id, conversation_id, appointment_type, status, title,
          description, location, starts_at, ends_at, assigned_to, metadata)
       VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, $9, $10,
          jsonb_build_object('source', 'ai_whatsapp', 'timezone', $11))
       RETURNING id, business_id, contact_id, conversation_id, quote_id, appointment_type,
          status, title, description, location, starts_at, ends_at, assigned_to,
          reminder_sent, metadata, created_at, updated_at`,
      [input.businessId, input.contactId, input.conversationId, input.appointmentType,
        input.title, input.description || null, input.location || null, startsAt, endsAt,
        assignedTo, business.timezone || 'UTC']
    );
    const appointment = appointmentResult.rows[0];
    if (!appointment) throw new BadRequestError('Appointment could not be created');

    let assignedName: string | null = null;
    let assignedPhone: string | null = null;
    if (assignedTo) {
      const staffResult = await client.query<{ display_name: string; phone: string | null }>(
        'SELECT display_name, phone FROM staff_users WHERE id = $1',
        [assignedTo]
      );
      assignedName = staffResult.rows[0]?.display_name || null;
      assignedPhone = staffResult.rows[0]?.phone || null;
    }

    return {
      appointment,
      businessName: business.business_name,
      timezone: business.timezone || 'UTC',
      wahaSession: business.waha_session_name,
      customerName: business.contact_name,
      customerPhone: business.contact_phone,
      assignedName,
      assignedPhone,
    };
  });
}
