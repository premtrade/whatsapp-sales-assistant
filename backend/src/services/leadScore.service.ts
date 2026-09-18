import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { PaginationQuery, TenantScopedQuery } from '../types/index';
import logger from '../utils/logger';

export interface LeadScore {
  id: string;
  contact_id: string;
  conversation_id?: string;
  budget_score: number;
  urgency_score: number;
  project_type_score: number;
  location_score: number;
  engagement_score: number;
  total_score: number;
  status: string;
  project_type?: string;
  estimated_budget?: string;
  preferred_timeline?: string;
  project_location?: string;
  score_reasoning?: Record<string, unknown>;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

export interface LeadScoreWithContact extends LeadScore {
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
}

export interface LeadScoreInput {
  contactId: string;
  conversationId?: string;
  budgetScore?: number;
  urgencyScore?: number;
  projectTypeScore?: number;
  locationScore?: number;
  engagementScore?: number;
  projectType?: string;
  estimatedBudget?: string;
  preferredTimeline?: string;
  projectLocation?: string;
  scoreReasoning?: Record<string, unknown>;
}

export interface LeadScoreFilters extends PaginationQuery, TenantScopedQuery {
  status?: string;
  contactId?: string;
  projectType?: string;
  minScore?: number;
  maxScore?: number;
}

function buildWhereClause(filters: LeadScoreFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`ls.status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.contactId) {
    conditions.push(`ls.contact_id = $${paramIndex++}`);
    params.push(filters.contactId);
  }
  if (filters.projectType) {
    conditions.push(`ls.project_type = $${paramIndex++}`);
    params.push(filters.projectType);
  }
  if (filters.minScore !== undefined) {
    conditions.push(`ls.total_score >= $${paramIndex++}`);
    params.push(filters.minScore);
  }
  if (filters.maxScore !== undefined) {
    conditions.push(`ls.total_score <= $${paramIndex++}`);
    params.push(filters.maxScore);
  }
  const tenantId = filters.businessId || filters.tenantId;
  if (tenantId) {
    conditions.push(`ls.business_id = $${paramIndex++}`);
    params.push(tenantId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where: whereClause, params };
}

export async function getLeadScores(filters: LeadScoreFilters): Promise<{ data: LeadScoreWithContact[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const sortBy = filters.sortBy || 'total_score';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const { where, params } = buildWhereClause(filters);

  const countQuery = `SELECT COUNT(*) as total FROM lead_scores ls ${where}`;
  const countResult = await query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataQuery = `
    SELECT
      ls.id, ls.contact_id, ls.conversation_id,
      ls.budget_score, ls.urgency_score, ls.project_type_score, ls.location_score, ls.engagement_score,
      ls.total_score, ls.status, ls.project_type, ls.estimated_budget, ls.preferred_timeline,
      ls.project_location, ls.score_reasoning, ls.last_calculated_at, ls.created_at, ls.updated_at,
      c.display_name as contact_name, c.phone as contact_phone, c.email as contact_email
    FROM lead_scores ls
    JOIN contacts c ON ls.contact_id = c.id
    ${where}
    ORDER BY ls.${sortBy} ${sortOrder}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query<LeadScoreWithContact>(dataQuery, [...params, limit, offset]);

  return {
    data: dataResult.rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getLeadScoreById(id: string, tenantId: string): Promise<LeadScore> {
  const result = await query<LeadScore>(
    `SELECT id, contact_id, conversation_id, budget_score, urgency_score, project_type_score,
            location_score, engagement_score, total_score, status, project_type, estimated_budget,
            preferred_timeline, project_location, score_reasoning, last_calculated_at, created_at, updated_at
      FROM lead_scores
      WHERE id = $1 AND business_id = $2`,
    [id, tenantId]
  );

  const score = result.rows[0];
  if (!score) throw new NotFoundError('Lead score not found');
  return score;
}

export async function getLeadScoreByContact(contactId: string): Promise<LeadScore | null> {
  const result = await query<LeadScore>(
    `SELECT id, contact_id, conversation_id, budget_score, urgency_score, project_type_score,
            location_score, engagement_score, total_score, status, project_type, estimated_budget,
            preferred_timeline, project_location, score_reasoning, last_calculated_at, created_at, updated_at
     FROM lead_scores
     WHERE contact_id = $1
     ORDER BY last_calculated_at DESC
     LIMIT 1`,
    [contactId]
  );

  return result.rows[0] || null;
}

export async function calculateAndSaveLeadScore(input: LeadScoreInput, tenantId: string): Promise<LeadScore> {
  const weights = { budget: 0.25, urgency: 0.20, project_type: 0.25, location: 0.15, engagement: 0.15 };

  const budgetScore = Math.max(0, Math.min(100, input.budgetScore ?? 0));
  const urgencyScore = Math.max(0, Math.min(100, input.urgencyScore ?? 0));
  const projectTypeScore = Math.max(0, Math.min(100, input.projectTypeScore ?? 0));
  const locationScore = Math.max(0, Math.min(100, input.locationScore ?? 0));
  const engagementScore = Math.max(0, Math.min(100, input.engagementScore ?? 0));

  const totalScore = Math.round(
    (budgetScore * weights.budget) +
    (urgencyScore * weights.urgency) +
    (projectTypeScore * weights.project_type) +
    (locationScore * weights.location) +
    (engagementScore * weights.engagement)
  );

  const clampedTotal = Math.max(0, Math.min(100, totalScore));

  const result = await query<LeadScore>(
    `INSERT INTO lead_scores (
      contact_id, conversation_id, business_id, budget_score, urgency_score, project_type_score,
      location_score, engagement_score, total_score, status, project_type, estimated_budget,
      preferred_timeline, project_location, score_reasoning
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10, $11, $12, $13, $14)
    ON CONFLICT (contact_id, conversation_id) DO UPDATE SET
      budget_score = EXCLUDED.budget_score,
      urgency_score = EXCLUDED.urgency_score,
      project_type_score = EXCLUDED.project_type_score,
      location_score = EXCLUDED.location_score,
      engagement_score = EXCLUDED.engagement_score,
      total_score = EXCLUDED.total_score,
      project_type = EXCLUDED.project_type,
      estimated_budget = EXCLUDED.estimated_budget,
      preferred_timeline = EXCLUDED.preferred_timeline,
      project_location = EXCLUDED.project_location,
      score_reasoning = EXCLUDED.score_reasoning,
      last_calculated_at = NOW(),
      updated_at = NOW()
    RETURNING id, contact_id, conversation_id, business_id, budget_score, urgency_score, project_score_type,
              location_score, engagement_score, total_score, status, project_type, estimated_budget,
              preferred_timeline, project_location, score_reasoning, last_calculated_at, created_at, updated_at`,
    [
      input.contactId,
      input.conversationId || null,
      tenantId,
      budgetScore,
      urgencyScore,
      projectTypeScore,
      locationScore,
      engagementScore,
      clampedTotal,
      input.projectType || null,
      input.estimatedBudget || null,
      input.preferredTimeline || null,
      input.projectLocation || null,
      input.scoreReasoning || {},
    ]
  );

  const score = result.rows[0];
  if (!score) throw new NotFoundError('Failed to calculate lead score');

  logger.info('Lead score calculated', {
    leadScoreId: score.id,
    contactId: input.contactId,
  });

  return score;
}

export async function updateLeadScoreStatus(id: string, status: string, tenantId: string): Promise<LeadScore> {
  const validStatuses = ['new', 'qualified', 'unqualified', 'converted', 'lost'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid lead score status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  const result = await query<LeadScore>(
    `UPDATE lead_scores SET status = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3
    RETURNING id, contact_id, conversation_id, budget_score, urgency_score, project_type_score,
              location_score, engagement_score, total_score, status, project_type, estimated_budget,
              preferred_timeline, project_location, score_reasoning, last_calculated_at, created_at, updated_at`,
    [status, id, tenantId]
  );

  const score = result.rows[0];
  if (!score) throw new NotFoundError('Lead score not found');

  logger.info('Lead score status updated', { leadScoreId: id, newStatus: status });

  return score;
}

export async function getLeadPipelineSummary(tenantId: string): Promise<{
  total: number;
  averageScore: number;
  byStatus: Record<string, number>;
  byProjectType: Record<string, number>;
  scoreDistribution: { range: string; count: number }[];
}> {
  const [totalResult, avgResult, statusResult, projectTypeResult, distributionResult] = await Promise.all([
    query<{ total: string }>('SELECT COUNT(*) as total FROM lead_scores WHERE business_id = $1', [tenantId]),
    query<{ avg: string }>('SELECT COALESCE(ROUND(AVG(total_score)), 0) as avg FROM lead_scores WHERE business_id = $1', [tenantId]),
    query<{ status: string; count: string }>('SELECT status, COUNT(*) as count FROM lead_scores WHERE business_id = $1 GROUP BY status', [tenantId]),
    query<{ project_type: string; count: string }>('SELECT project_type, COUNT(*) as count FROM lead_scores WHERE business_id = $1 AND project_type IS NOT NULL GROUP BY project_type ORDER BY count DESC', [tenantId]),
    query<{ range: string; count: string }>(`
      SELECT
        CASE
          WHEN total_score < 30 THEN '0-29 (Low)'
          WHEN total_score < 70 THEN '30-69 (Medium)'
          ELSE '70-100 (High)'
        END as range,
        COUNT(*) as count
      FROM lead_scores
      WHERE business_id = $1
      GROUP BY range
      ORDER BY MIN(total_score)
    `, [tenantId]),
  ]);

  const byStatus: Record<string, number> = {};
  statusResult.rows.forEach((row) => { byStatus[row.status] = parseInt(row.count, 10); });

  const byProjectType: Record<string, number> = {};
  projectTypeResult.rows.forEach((row) => { byProjectType[row.project_type || 'Unspecified'] = parseInt(row.count, 10); });

  return {
    total: parseInt(totalResult.rows[0]?.total || '0', 10),
    averageScore: parseInt(avgResult.rows[0]?.avg || '0', 10),
    byStatus,
    byProjectType,
    scoreDistribution: distributionResult.rows.map((row) => ({ range: row.range, count: parseInt(row.count, 10) })),
  };
}
