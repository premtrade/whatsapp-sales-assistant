import { Request, Response } from 'express';
import { getLeadScores, getLeadScoreById, calculateAndSaveLeadScore, updateLeadScoreStatus, getLeadPipelineSummary } from '../services/leadScore.service';
import { getPagination, getOptionalString, getOptionalNumber } from '../utils/helpers';
import { BadRequestError } from '../utils/errors';
import { UserPayload } from '../types';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';

export const listLeadScores = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, sortBy, sortOrder } = getPagination(req.query as Record<string, unknown>);
  const query = req.query as Record<string, unknown>;

  const result = await getLeadScores({
    page,
    limit,
    sortBy,
    sortOrder,
    status: getOptionalString(query.status),
    contactId: getOptionalString(query.contactId),
    projectType: getOptionalString(query.projectType),
    minScore: getOptionalNumber(query.minScore),
    maxScore: getOptionalNumber(query.maxScore),
  });

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};

export const getLeadScore = async (req: Request, res: Response): Promise<void> => {
  const score = await getLeadScoreById(req.params.id!);
  res.json({ success: true, data: score });
};

export const createLeadScore = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) throw new BadRequestError('Unauthorized');

  const { contactId, conversationId, budgetScore, urgencyScore, projectTypeScore, locationScore, engagementScore, projectType, estimatedBudget, preferredTimeline, projectLocation, scoreReasoning } = req.body;

  if (!contactId) throw new BadRequestError('contactId is required');

  const score = await calculateAndSaveLeadScore({
    contactId,
    conversationId,
    budgetScore: budgetScore ?? 0,
    urgencyScore: urgencyScore ?? 0,
    projectTypeScore: projectTypeScore ?? 0,
    locationScore: locationScore ?? 0,
    engagementScore: engagementScore ?? 0,
    projectType,
    estimatedBudget,
    preferredTimeline,
    projectLocation,
    scoreReasoning,
  });

  await createAuditLog(
    'lead_scores',
    'create',
    currentUser.id,
    'staff',
    `Lead score calculated for contact ${contactId}`,
    undefined,
    { totalScore: score.total_score, status: score.status },
    { leadScoreId: score.id },
    req.ip!,
    req.get('user-agent')!
  );

  logger.info('Lead score created via API', { leadScoreId: score.id, contactId, userId: currentUser.id });

  res.status(201).json({
    success: true,
    data: score,
    message: 'Lead score calculated successfully',
  });
};

export const updateLeadScore = async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as Request & { user?: UserPayload }).user;
  if (!currentUser) throw new BadRequestError('Unauthorized');

  const { status } = req.body;
  if (!status) throw new BadRequestError('status is required');

  const score = await updateLeadScoreStatus(req.params.id!, status);

  await createAuditLog(
    'lead_scores',
    'update_status',
    currentUser.id,
    'staff',
    `Lead score status updated to ${status}`,
    undefined,
    { status },
    { leadScoreId: score.id },
    req.ip!,
    req.get('user-agent')!
  );

  res.json({
    success: true,
    data: score,
    message: 'Lead score updated',
  });
};

export const getLeadPipeline = async (_req: Request, res: Response): Promise<void> => {
  const summary = await getLeadPipelineSummary();
  res.json({ success: true, data: summary });
};
