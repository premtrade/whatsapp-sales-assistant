import { Request, Response } from 'express';
import { z } from 'zod';
import { getMessages, sendMessage } from '../services/message.service';
import { BadRequestError } from '../utils/errors';
import { createAuditLog } from '../services/audit.service';
import { UserPayload } from '../types';

const replySchema = z.object({
  text_body: z.string().min(1, 'Message text is required').max(10000, 'Message too long'),
});

export const getMessagesController = async (req: Request, res: Response): Promise<void> => {
  const conversationId = req.params.conversationId!;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const messages = await getMessages(conversationId, limit, offset);

  res.json({
    success: true,
    data: messages,
  });
};

export const replyToConversation = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  try {
    const validated = replySchema.parse(req.body);
      const message = await sendMessage(req.params.conversationId!, validated.text_body, currentUser.id);

    await createAuditLog(
      'messages',
      'send_reply',
      currentUser.id,
      'staff',
      `Staff sent reply message`,
      undefined,
      { direction: 'outgoing', messageId: message.id },
      { conversationId: req.params.conversationId!, messageId: message.id },
      req.ip!,
      req.get('user-agent')!
    );

    res.status(201).json({
      success: true,
      data: message,
      message: 'Reply sent successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};
