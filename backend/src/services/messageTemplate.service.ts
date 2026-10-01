import { query } from '../utils/database';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';

export interface MessageTemplate {
  id: string;
  business_id: string;
  name: string;
  category: string;
  description: string | null;
  subject: string | null;
  body: string;
  variables: string[];
  language: string;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export async function getMessageTemplates(tenantId: string, category?: string): Promise<MessageTemplate[]> {
  const sql = `SELECT id, business_id, name, category, description, subject, body, variables, language, is_active, usage_count, created_at, updated_at, last_used_at
     FROM message_templates
     WHERE business_id = $1
     ${category ? 'AND category = $2' : ''}
     ORDER BY category ASC, name ASC`;
  const params = category ? [tenantId, category] : [tenantId];
  const result = await query<MessageTemplate>(sql, params);
  return result.rows;
}

export async function getMessageTemplateById(id: string, tenantId: string): Promise<MessageTemplate> {
  const sql = `SELECT id, business_id, name, category, description, subject, body, variables, language, is_active, usage_count, created_at, updated_at, last_used_at
     FROM message_templates
     WHERE id = $1 AND business_id = $2`;
  const result = await query<MessageTemplate>(sql, [id, tenantId]);
  const template = result.rows[0];
  if (!template) throw new NotFoundError('Template not found');
  return template;
}

export async function createMessageTemplate(data: {
  name: string;
  category: string;
  description?: string | null;
  subject?: string | null;
  body: string;
  variables?: string[];
  language?: string;
  is_active?: boolean;
}, tenantId: string): Promise<MessageTemplate> {
  const name = (data.name || '').trim();
  if (!name) throw new BadRequestError('Template name is required');
  if (!data.body.trim()) throw new BadRequestError('Template body is required');

  const variables = Array.isArray(data.variables) ? data.variables : [];

  try {
    const result = await query<MessageTemplate>(
      `INSERT INTO message_templates (name, category, description, subject, body, variables, language, is_active, business_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING id, business_id, name, category, description, subject, body, variables, language, is_active, usage_count, created_at, updated_at, last_used_at`,
      [
        name,
        data.category,
        data.description || null,
        data.subject || null,
        data.body,
        JSON.stringify(variables),
        data.language || 'en',
        data.is_active ?? true,
        tenantId,
      ]
    );
    const created = result.rows[0];
    if (!created) throw new Error('Failed to create message template');
    return created;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
      throw new ConflictError(`Template '${name}' already exists for this tenant`);
    }
    throw error;
  }
}

export async function updateMessageTemplate(id: string, data: {
  name?: string;
  category?: string;
  description?: string | null;
  subject?: string | null;
  body?: string;
  variables?: string[];
  language?: string;
  is_active?: boolean;
}, tenantId: string): Promise<MessageTemplate> {
  const existing = await getMessageTemplateById(id, tenantId);

  const name = data.name !== undefined ? (data.name || '').trim() : existing.name;
  const body = data.body !== undefined ? (data.body || '').trim() : existing.body;
  const category = data.category ?? existing.category;
  const description = data.description !== undefined ? data.description : existing.description;
  const subject = data.subject !== undefined ? data.subject : existing.subject;
  const variables = data.variables !== undefined ? data.variables : existing.variables;
  const language = data.language ?? existing.language;
  const isActive = data.is_active ?? existing.is_active;

  if (!name) throw new BadRequestError('Template name is required');
  if (!body) throw new BadRequestError('Template body is required');

  const result = await query<MessageTemplate>(
    `UPDATE message_templates
     SET name = $1, category = $2, description = $3, subject = $4, body = $5, variables = $6::jsonb, language = $7, is_active = $8, updated_at = NOW()
     WHERE id = $9 AND business_id = $10
     RETURNING id, business_id, name, category, description, subject, body, variables, language, is_active, usage_count, created_at, updated_at, last_used_at`,
    [name, category, description, subject, body, JSON.stringify(variables), language, isActive, id, tenantId]
  );

  const updated = result.rows[0];
  if (!updated) throw new NotFoundError('Template not found');
  return updated;
}

export async function deleteMessageTemplate(id: string, tenantId: string): Promise<void> {
  const result = await query(
    `DELETE FROM message_templates WHERE id = $1 AND business_id = $2`,
    [id, tenantId]
  );
  if (result.rowCount === 0) {
    throw new NotFoundError('Template not found');
  }
}
