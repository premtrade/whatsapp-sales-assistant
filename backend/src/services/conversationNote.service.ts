import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

export interface ConversationNote {
  id: string;
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

export async function createConversationNote(input: CreateNoteInput): Promise<ConversationNote> {
  if (!input.note.trim()) {
    throw new BadRequestError('Note text is required');
  }

  const result = await query<ConversationNote>(
    `INSERT INTO conversation_notes (conversation_id, staff_id, note, is_internal)
     VALUES ($1, $2, $3, $4)
     RETURNING id, conversation_id, staff_id, note, is_internal, created_at, updated_at`,
    [input.conversationId, input.staffId, input.note.trim(), input.isInternal ?? true]
  );

  const note = result.rows[0];
  if (!note) throw new NotFoundError('Failed to create conversation note');

  logger.info('Conversation note created', { noteId: note.id, conversationId: input.conversationId, staffId: input.staffId });

  return note;
}

export async function getConversationNotes(conversationId: string): Promise<ConversationNote[]> {
  const result = await query<ConversationNote>(
    `SELECT id, conversation_id, staff_id, note, is_internal, created_at, updated_at
     FROM conversation_notes
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );

  return result.rows;
}

export async function deleteConversationNote(id: string, staffId: string): Promise<void> {
  const result = await query(
    `DELETE FROM conversation_notes WHERE id = $1 AND staff_id = $2 RETURNING id`,
    [id, staffId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Note not found or you do not have permission to delete it');
  }

  logger.info('Conversation note deleted', { noteId: id, staffId });
}
