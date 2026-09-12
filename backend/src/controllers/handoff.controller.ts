import { Request, Response } from 'express';
import { z } from 'zod';
import { getHandoffs, getPendingHandoffs, assignHandoff, updateHandoffStatus, getHandoffById, createHandoff } from '../services/handoff.service';
import { BadRequestError } from '../utils/errors';
import { getPagination, getOptionalString } from '../utils/helpers';
import logger from '../utils/logger';
import { createAuditLog } from '../services/audit.service';
import { UserPayload } from '../types';

const assignSchema = z.object({
  staffId: z.string().uuid('Invalid staff ID format'),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'accepted', 'completed', 'cancelled']),
});

const createHandoffSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID format'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

export const listHandoffs = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;

  const result = await getHandoffs({
    page,
    limit,
    sortBy,
    sortOrder,
    status: getOptionalString(query.status),
    conversationId: getOptionalString(query.conversationId),
    assignedTo: getOptionalString(query.assignedTo),
    requestedBy: getOptionalString(query.requestedBy),
  });

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};

export const listPendingHandoffs = async (_req: Request, res: Response): Promise<void> => {
  const handoffs = await getPendingHandoffs();

  res.json({
    success: true,
    data: handoffs,
  });
};

export const assignHandoffHandler = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  try {
    const validated = assignSchema.parse(req.body);
    const handoff = await assignHandoff(req.params.id!, validated.staffId, currentUser.id);

    await createAuditLog(
      'handoffs',
      'assign',
      currentUser.id,
      'staff',
      `Handoff assigned to staff ${validated.staffId}`,
      undefined,
      { assigned_to: validated.staffId },
      { handoffId: req.params.id },
      req.ip!,
      req.get('user-agent')!
    );

    logger.info('Handoff assigned via API', { handoffId: req.params.id, userId: currentUser.id });

    res.json({
      success: true,
      data: handoff,
      message: 'Handoff assigned successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};

export const updateHandoffStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  try {
    const validated = updateStatusSchema.parse(req.body);
    const handoff = await updateHandoffStatus(req.params.id!, validated.status, currentUser.id);

    await createAuditLog(
      'handoffs',
      'update_status',
      currentUser.id,
      'staff',
      `Handoff status updated to ${validated.status}`,
      undefined,
      { status: validated.status },
      { handoffId: req.params.id },
      req.ip!,
      req.get('user-agent')!
    );

    res.json({
      success: true,
      data: handoff,
      message: 'Handoff status updated',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};

export const getHandoff = async (req: Request, res: Response): Promise<void> => {
  const handoff = await getHandoffById(req.params.id!);

  res.json({
    success: true,
    data: handoff,
  });
};

export const createHandoffHandler = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) {
    throw new BadRequestError('Unauthorized');
  }

  try {
    const validated = createHandoffSchema.parse(req.body);
    const handoff = await createHandoff({
      conversationId: validated.conversationId,
      requestedBy: currentUser.id,
      reason: validated.reason,
      notes: validated.notes,
    });

    await createAuditLog(
      'handoffs',
      'create',
      currentUser.id,
      'staff',
      `Handoff created for conversation ${validated.conversationId}`,
      undefined,
      { conversation_id: validated.conversationId, reason: validated.reason },
      { handoffId: handoff.id },
      req.ip!,
      req.get('user-agent')!
    );

    logger.info('Handoff created via API', { handoffId: handoff.id, userId: currentUser.id });

    res.status(201).json({
      success: true,
      data: handoff,
      message: 'Handoff created successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError(error.errors.map((e) => e.message).join(', '));
    }
    throw error;
  }
};
