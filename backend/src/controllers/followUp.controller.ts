import { Request, Response } from 'express';
import { getDueFollowUps, markFollowUpSent, markFollowUpFailed, cancelFollowUp, getFollowUpsByConversation } from '../services/followUp.service';
import { BadRequestError } from '../utils/errors';
import { UserPayload } from '../types';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';

export const listDueFollowUps = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as any).user?.businessId || (req as any).user?.tenantId;
  const limit = typeof req.query.limit === 'string' ? Math.min(parseInt(req.query.limit, 10), 100) : 50;
  const followUps = await getDueFollowUps(limit, tenantId);

  res.json({
    success: true,
    data: followUps,
  });
};

export const listFollowUpsByConversation = async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as any).user?.businessId || (req as any).user?.tenantId;
  const followUps = await getFollowUpsByConversation(req.params.conversationId!, tenantId);
  res.json({ success: true, data: followUps });
};

export const dispatchFollowUp = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) throw new BadRequestError('Unauthorized');

  const { id } = req.params;
  const action = req.body.action as string;

  if (action === 'send') {
    const followUp = await markFollowUpSent(id!);
    res.json({ success: true, data: followUp, message: 'Follow-up marked as sent' });
  } else if (action === 'fail') {
    const followUp = await markFollowUpFailed(id!);
    res.json({ success: true, data: followUp, message: 'Follow-up marked as failed' });
  } else if (action === 'cancel') {
    const followUp = await cancelFollowUp(id!);
    await createAuditLog(
      'follow_up_queue',
      'cancel',
      currentUser.id,
      'staff',
      `Follow-up cancelled`,
      undefined,
      { followUpId: id },
      { followUpId: id },
      req.ip!,
      req.get('user-agent')!
    );
    res.json({ success: true, data: followUp, message: 'Follow-up cancelled' });
  } else {
    throw new BadRequestError('Invalid action. Must be one of: send, fail, cancel');
  }
};
