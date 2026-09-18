import { Request, Response } from 'express';
import { createConversationNote, getConversationNotes, deleteConversationNote } from '../services/conversationNote.service';
import { BadRequestError } from '../utils/errors';
import { UserPayload } from '../types';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';

export const listConversationNotes = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as any).user?.businessId || (req as any).user?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Tenant scope required');
  }
  const notes = await getConversationNotes(req.params.conversationId!, tenantId);
  res.json({ success: true, data: notes });
};

export const addConversationNote = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) throw new BadRequestError('Unauthorized');

  const { note, isInternal } = req.body;
  const tenantId = currentUser.businessId || currentUser.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Tenant scope required');
  }

  const created = await createConversationNote({
    conversationId: req.params.conversationId!,
    staffId: currentUser.id,
    note,
    isInternal: isInternal ?? true,
  }, tenantId);

  await createAuditLog(
    'conversation_notes',
    'create',
    currentUser.id,
    'staff',
    `Note added to conversation`,
    undefined,
    { conversationId: req.params.conversationId },
    { noteId: created.id },
    req.ip!,
    req.get('user-agent')!,
    tenantId
  );

  res.status(201).json({ success: true, data: created, message: 'Note added' });
};

export const removeConversationNote = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) throw new BadRequestError('Unauthorized');

  const tenantId = currentUser.businessId || currentUser.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Tenant scope required');
  }

  await deleteConversationNote(req.params.noteId!, currentUser.id, tenantId);

  await createAuditLog(
    'conversation_notes',
    'delete',
    currentUser.id,
    'staff',
    `Note deleted`,
    undefined,
    { noteId: req.params.noteId },
    { noteId: req.params.noteId },
    req.ip!,
    req.get('user-agent')!,
    tenantId
  );

  res.json({ success: true, message: 'Note removed' });
};
