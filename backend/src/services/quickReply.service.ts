import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

export interface QuickReply {
  id: string;
  title: string;
  text: string;
  category?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateQuickReplyInput {
  title: string;
  text: string;
  category?: string;
  createdBy: string;
}

export async function getQuickReplies(category?: string): Promise<QuickReply[]> {
  let sql = `SELECT id, title, text, category, created_by, created_at, updated_at FROM quick_replies`;
  const params: unknown[] = [];

  if (category) {
    sql += ` WHERE category = $1`;
    params.push(category);
  }

  sql += ` ORDER BY category, title ASC`;

  const result = await query<QuickReply>(sql, params);
  return result.rows;
}

export async function createQuickReply(input: CreateQuickReplyInput): Promise<QuickReply> {
  if (!input.title.trim() || !input.text.trim()) {
    throw new BadRequestError('Title and text are required');
  }

  const result = await query<QuickReply>(
    `INSERT INTO quick_replies (title, text, category, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, text, category, created_by, created_at, updated_at`,
    [input.title.trim(), input.text.trim(), input.category || null, input.createdBy]
  );

  const reply = result.rows[0];
  if (!reply) throw new NotFoundError('Failed to create quick reply');

  logger.info('Quick reply created', { quickReplyId: reply.id, title: reply.title, createdBy: input.createdBy });

  return reply;
}

export async function updateQuickReply(id: string, input: Partial<CreateQuickReplyInput>): Promise<QuickReply> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    params.push(input.title.trim());
  }
  if (input.text !== undefined) {
    updates.push(`text = $${paramIndex++}`);
    params.push(input.text.trim());
  }
  if (input.category !== undefined) {
    updates.push(`category = $${paramIndex++}`);
    params.push(input.category || null);
  }

  if (updates.length === 0) {
    throw new BadRequestError('No fields to update');
  }

  params.push(id);
  const sql = `UPDATE quick_replies SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, title, text, category, created_by, created_at, updated_at`;

  const result = await query<QuickReply>(sql, params);
  const reply = result.rows[0];

  if (!reply) throw new NotFoundError('Quick reply not found');

  logger.info('Quick reply updated', { quickReplyId: id });

  return reply;
}

export async function deleteQuickReply(id: string): Promise<void> {
  const result = await query(`DELETE FROM quick_replies WHERE id = $1 RETURNING id`, [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Quick reply not found');
  }

  logger.info('Quick reply deleted', { quickReplyId: id });
}
