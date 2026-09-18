import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

export interface ConversationNote {
  id: string;
  business_id: string;
  conversation_id: string;
  staff_id: string;
  note: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteInput {
  conversationId: string;
  staffId: string;
  note: string;
  isInternal?: boolean;
}

export async function createConversationNote(input: CreateNoteInput, tenantId: string): Promise<ConversationNote> {
  if (!input.note.trim()) {
    throw new BadRequestError('Note text is required');
  }

  const result = await query<ConversationNote>(
    `INSERT INTO conversation_notes (conversation_id, staff_id, note, is_internal, business_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, business_id, conversation_id, staff_id, note, is_internal, created_at, updated_at`,
    [input.conversationId, input.staffId, input.note.trim(), input.isInternal ?? true, tenantId]
  );

  const note = result.rows[0];
  if (!note) throw new NotFoundError('Failed to create conversation note');

  logger.info('Conversation note created', { noteId: note.id, conversationId: input.conversationId, staffId: input.staffId, tenantId });

  return note;
}

export async function getConversationNotes(conversationId: string, tenantId?: string): Promise<ConversationNote[]> {
  let sql = `
    SELECT id, business_id, conversation_id, staff_id, note, is_internal, created_at, updated_at
    FROM conversation_notes
    WHERE conversation_id = $1
  `;
  const params: unknown[] = [conversationId];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` ORDER BY created_at ASC`;

  const result = await query<ConversationNote>(sql, params);
  return result.rows;
}

export async function deleteConversationNote(id: string, staffId: string, tenantId?: string): Promise<void> {
  let sql = `
    DELETE FROM conversation_notes
    WHERE id = $1 AND staff_id = $2
  `;
  const params: unknown[] = [id, staffId];
  let paramIndex = 3;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` RETURNING id`;

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    throw new NotFoundError('Note not found or you do not have permission to delete it');
  }

  logger.info('Conversation note deleted', { noteId: id, staffId, tenantId });
}
