import { query } from '../utils/database';
import logger from '../utils/logger';
import { NotFoundError, BadRequestError, AppError } from '../utils/errors';
import { ConversationFilters, Conversation, Message, Contact } from '../types';
import { getLeadScoreByContact } from './leadScore.service';
import { emitConversationStatusUpdated, emitDashboardStatsUpdated } from '../websocketServer';

export interface ConversationWithDetails extends Conversation {
  contact: Contact;
  assignedStaff?: {
    id: string;
    display_name: string;
    email: string;
    role: string;
  };
  lastMessage?: Message;
  messageCount: number;
  leadScore?: {
    total_score: number;
    status: string;
    project_type: string;
    estimated_budget: string;
  };
}

export interface CreateConversationInput {
  contactId: string;
  channel?: string;
  status?: string;
}

function buildWhereClause(filters: ConversationFilters): { where: string; params: unknown[]; count: string } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`c.status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.channel) {
    conditions.push(`c.channel = $${paramIndex++}`);
    params.push(filters.channel);
  }
  if (filters.contactId) {
    conditions.push(`c.contact_id = $${paramIndex++}`);
    params.push(filters.contactId);
  }
  if (filters.assignedTo) {
    conditions.push(`c.assigned_to = $${paramIndex++}`);
    params.push(filters.assignedTo);
  }
  if (filters.search) {
    conditions.push(`(ct.display_name ILIKE $${paramIndex++} OR ct.phone ILIKE $${paramIndex++} OR ct.email ILIKE $${paramIndex++})`);
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.startDate) {
    conditions.push(`c.started_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`c.started_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where: whereClause, params, count: whereClause };
}

export async function getConversations(filters: ConversationFilters): Promise<{ data: ConversationWithDetails[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const sortBy = filters.sortBy || 'last_message_at';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const { where, params, count } = buildWhereClause(filters);

  const countQuery = `SELECT COUNT(*) as total FROM conversations c JOIN contacts ct ON c.contact_id = ct.id ${count}`;
  const countResult = await query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataQuery = `
    SELECT 
      c.id, c.contact_id, c.channel, c.status, c.assigned_to, c.started_at, c.last_message_at, c.ended_at, c.created_at, c.updated_at,
      ct.display_name as contact_display_name, ct.phone as contact_phone, ct.email as contact_email, ct.company as contact_company,
      su.first_name as staff_first_name, su.last_name as staff_last_name, su.email as staff_email, su.role as staff_role,
      m.text_body as last_message_text, m.created_at as last_message_created_at,
      msg_count.message_count
    FROM conversations c
    JOIN contacts ct ON c.contact_id = ct.id
    LEFT JOIN staff_users su ON c.assigned_to = su.id
    LEFT JOIN LATERAL (
      SELECT text_body, created_at FROM messages 
      WHERE conversation_id = c.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) m ON true
    LEFT JOIN (
      SELECT conversation_id, COUNT(*) as message_count
      FROM messages
      GROUP BY conversation_id
    ) msg_count ON msg_count.conversation_id = c.id
    ${where}
    ORDER BY c.${sortBy} ${sortOrder}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query<ConversationWithDetails & {
    contact_display_name: string;
    contact_phone: string;
    contact_email: string;
    contact_company: string;
    staff_first_name: string;
    staff_last_name: string;
    staff_email: string;
    staff_role: string;
    last_message_text: string | null;
    last_message_created_at: Date | null;
    message_count: string;
  }>(dataQuery, [...params, limit, offset]);

  const contactIds = [...new Set(dataResult.rows.map((r) => r.contact_id).filter(Boolean))] as string[];
  const leadScoresMap = new Map<string, { total_score: number; status: string; project_type: string; estimated_budget: string }>();
  if (contactIds.length > 0) {
    const leadScoresResult = await query(
      `SELECT contact_id, total_score, status, project_type, estimated_budget
       FROM lead_scores
       WHERE contact_id = ANY($1::uuid[])
       ORDER BY last_calculated_at DESC`,
      [contactIds]
    );
    for (const row of leadScoresResult.rows) {
      if (!leadScoresMap.has(row.contact_id)) {
        leadScoresMap.set(row.contact_id, {
          total_score: row.total_score,
          status: row.status,
          project_type: row.project_type || '',
          estimated_budget: row.estimated_budget || '',
        });
      }
    }
  }

  const data: ConversationWithDetails[] = dataResult.rows.map((row) => {
    const leadScore = row.contact_id ? leadScoresMap.get(row.contact_id) : undefined;
    return {
      id: row.id,
      contact_id: row.contact_id,
      channel: row.channel,
      status: row.status,
      assigned_to: row.assigned_to,
      started_at: row.started_at,
      last_message_at: row.last_message_at,
      ended_at: row.ended_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      contact: {
        id: row.contact_id,
        phone: row.contact_phone,
        display_name: row.contact_display_name,
        email: row.contact_email,
        company: row.contact_company,
      } as Contact,
      assignedStaff: row.assigned_to ? {
        id: row.assigned_to,
        display_name: `${row.staff_first_name} ${row.staff_last_name}`,
        email: row.staff_email,
        role: row.staff_role,
      } : undefined,
      lastMessage: row.last_message_text ? {
        id: '',
        conversation_id: row.id,
        direction: 'outgoing',
        sender_type: 'ai',
        message_type: 'text',
        text_body: row.last_message_text,
        created_at: row.last_message_created_at,
      } as Message : undefined,
      messageCount: parseInt(row.message_count || '0', 10),
      leadScore: leadScore ? {
        total_score: leadScore.total_score,
        status: leadScore.status,
        project_type: leadScore.project_type,
        estimated_budget: leadScore.estimated_budget,
      } : undefined,
    };
  });

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

export async function getConversationById(id: string): Promise<ConversationWithDetails> {
  const result = await query<ConversationWithDetails & {
    contact_display_name: string;
    contact_phone: string;
    contact_email: string;
    contact_company: string;
    staff_first_name: string;
    staff_last_name: string;
    staff_email: string;
    staff_role: string;
  }>(
    `SELECT 
      c.id, c.contact_id, c.channel, c.status, c.assigned_to, c.started_at, c.last_message_at, c.ended_at, c.created_at, c.updated_at,
      ct.display_name as contact_display_name, ct.phone as contact_phone, ct.email as contact_email, ct.company as contact_company,
      su.first_name as staff_first_name, su.last_name as staff_last_name, su.email as staff_email, su.role as staff_role
     FROM conversations c
     JOIN contacts ct ON c.contact_id = ct.id
     LEFT JOIN staff_users su ON c.assigned_to = su.id
     WHERE c.id = $1`,
    [id]
  );

  const row = result.rows[0];

  if (!row) {
    throw new NotFoundError('Conversation not found');
  }

  const leadScore = await getLeadScoreByContact(row.contact_id);

  return {
    id: row.id,
    contact_id: row.contact_id,
    channel: row.channel,
    status: row.status,
    assigned_to: row.assigned_to,
    started_at: row.started_at,
    last_message_at: row.last_message_at,
    ended_at: row.ended_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    contact: {
      id: row.contact_id,
      phone: row.contact_phone,
      display_name: row.contact_display_name,
      email: row.contact_email,
      company: row.contact_company,
    } as Contact,
    assignedStaff: row.assigned_to ? {
      id: row.assigned_to,
      display_name: `${row.staff_first_name} ${row.staff_last_name}`,
      email: row.staff_email,
      role: row.staff_role,
    } : undefined,
    messageCount: 0,
    leadScore: leadScore ? {
      total_score: leadScore.total_score,
      status: leadScore.status,
      project_type: leadScore.project_type || '',
      estimated_budget: leadScore.estimated_budget || '',
    } : undefined,
  };
}

export async function getConversationMessages(conversationId: string, limit = 50, offset = 0): Promise<Message[]> {
  const result = await query<Message>(
    `SELECT id, conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body, media_url, mime_type, media_size, caption, metadata, delivered_at, read_at, created_at, updated_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );

  return result.rows;
}

export async function updateConversationStatus(
  id: string,
  status: string,
  userId: string
): Promise<Conversation> {
  const validStatuses = ['active', 'waiting_customer', 'waiting_agent', 'closed', 'archived'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  const result = await query<Conversation>(
    `UPDATE conversations 
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, contact_id, channel, status, assigned_to, started_at, last_message_at, ended_at, created_at, updated_at`,
    [status, id]
  );

  const conversation = result.rows[0];

  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  logger.info('Conversation status updated', { conversationId: id, newStatus: status, userId });

  // Emit real-time events
  await emitConversationStatusUpdated(conversation);
  await emitDashboardStatsUpdated();

  return conversation;
}

export async function assignConversation(conversationId: string, staffId: string): Promise<Conversation> {
  const result = await query<Conversation>(
    `UPDATE conversations 
     SET assigned_to = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, contact_id, channel, status, assigned_to, started_at, last_message_at, ended_at, created_at, updated_at`,
    [staffId, conversationId]
  );

  const conversation = result.rows[0];

  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  logger.info('Conversation assigned', { conversationId, staffId });

  return conversation;
}
