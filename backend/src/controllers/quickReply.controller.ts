import { Request, Response } from 'express';
import { getQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply } from '../services/quickReply.service';
import { BadRequestError } from '../utils/errors';
import { UserPayload } from '../types';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';

export const listQuickReplies = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as any).user?.businessId || (req as any).user?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Tenant scope required');
  }
  const category = req.query.category as string | undefined;
  const replies = await getQuickReplies(category, tenantId);
  res.json({ success: true, data: replies });
};

export const addQuickReply = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) throw new BadRequestError('Unauthorized');

  const tenantId = currentUser.businessId || currentUser.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Tenant scope required');
  }

  const reply = await createQuickReply({
    title: req.body.title,
    text: req.body.text,
    category: req.body.category,
    createdBy: currentUser.id,
  }, tenantId);

  await createAuditLog(
    'quick_replies',
    'create',
    currentUser.id,
    'staff',
    `Quick reply created: ${reply.title}`,
    undefined,
    { title: reply.title },
    { replyId: reply.id },
    req.ip!,
    req.get('user-agent')!,
    tenantId
  );

  res.status(201).json({ success: true, data: reply, message: 'Quick reply created' });
};

export const editQuickReply = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) throw new BadRequestError('Unauthorized');

  const tenantId = currentUser.businessId || currentUser.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Tenant scope required');
  }
  const reply = await updateQuickReply(req.params.id!, req.body, tenantId);

  await createAuditLog(
    'quick_replies',
    'update',
    currentUser.id,
    'staff',
    `Quick reply updated: ${reply.title}`,
    undefined,
    { title: reply.title },
    { quickReplyId: reply.id },
    req.ip!,
    req.get('user-agent')!,
    tenantId
  );

  res.json({ success: true, data: reply, message: 'Quick reply updated' });
};

export const removeQuickReply = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) throw new BadRequestError('Unauthorized');

  const tenantId = currentUser.businessId || currentUser.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Tenant scope required');
  }
  await deleteQuickReply(req.params.id!, tenantId);

  await createAuditLog(
    'quick_replies',
    'delete',
    currentUser.id,
    'staff',
    `Quick reply deleted`,
    undefined,
    { quickReplyId: req.params.id },
    { quickReplyId: req.params.id },
    req.ip!,
    req.get('user-agent')!
  );

  res.json({ success: true, message: 'Quick reply deleted' });
};
