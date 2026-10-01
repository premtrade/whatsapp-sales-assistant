import { Request, Response } from 'express';
import { z } from 'zod';
import { getMessageTemplates, getMessageTemplateById, createMessageTemplate, updateMessageTemplate, deleteMessageTemplate } from '../services/messageTemplate.service';
import { createAuditLog } from '../services/audit.service';
import { UserPayload } from '../types';
import { BadRequestError } from '../utils/errors';

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  body: z.string().min(1, 'Body is required'),
  variables: z.array(z.string()).optional(),
  language: z.string().optional(),
  is_active: z.boolean().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  language: z.string().optional(),
  is_active: z.boolean().optional(),
});

function getTenantId(req: Request): string {
  const user = (req as Request & { user?: UserPayload }).user;
  const tenantId = user?.businessId || user?.tenantId;
  if (!tenantId) throw new BadRequestError('Tenant scope required');
  return tenantId;
}

function currentUser(req: Request): UserPayload {
  const user = (req as Request & { user?: UserPayload }).user;
  if (!user) throw new BadRequestError('Unauthorized');
  return user;
}

export const listMessageTemplates = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const templates = await getMessageTemplates(tenantId, category);
  res.json({ success: true, data: templates });
};

export const getMessageTemplate = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantId(req);
  const template = await getMessageTemplateById(req.params.id!, tenantId);
  res.json({ success: true, data: template });
};

export const createMessageTemplateController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const tenantId = getTenantId(req);
  const validated = createTemplateSchema.parse(req.body);
  const created = await createMessageTemplate(validated, tenantId);

  await createAuditLog(
    'message_template',
    'create',
    user.id,
    'staff',
    `Template '${created.name}' created`,
    undefined,
    { name: created.name, category: created.category },
    { templateKey: created.id },
    req.ip,
    req.get('user-agent'),
    tenantId
  );

  res.status(201).json({ success: true, data: created });
};

export const updateMessageTemplateController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const tenantId = getTenantId(req);
  const validated = updateTemplateSchema.parse(req.body);
  const oldTemplate = await getMessageTemplateById(req.params.id!, tenantId);
  const updated = await updateMessageTemplate(req.params.id!, validated, tenantId);

  await createAuditLog(
    'message_template',
    'update',
    user.id,
    'staff',
    `Template '${updated.name}' updated`,
    { name: oldTemplate.name, body: oldTemplate.body },
    { name: updated.name, body: updated.body },
    { templateKey: updated.id },
    req.ip,
    req.get('user-agent'),
    tenantId
  );

  res.json({ success: true, data: updated });
};

export const deleteMessageTemplateController = async (req: Request, res: Response): Promise<void> => {
  const user = currentUser(req);
  const tenantId = getTenantId(req);
  const existing = await getMessageTemplateById(req.params.id!, tenantId);

  await deleteMessageTemplate(req.params.id!, tenantId);

  await createAuditLog(
    'message_template',
    'delete',
    user.id,
    'staff',
    `Template '${existing.name}' deleted`,
    { name: existing.name, category: existing.category },
    undefined,
    { templateKey: existing.id },
    req.ip,
    req.get('user-agent'),
    tenantId
  );

  res.json({ success: true, message: 'Template deleted' });
};
