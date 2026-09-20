import { query } from '../utils/database';
import { AuditLogFilters, AuditLog } from '../types';
import { BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

function buildWhereClause(filters: AuditLogFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.entityType) {
    conditions.push(`entity_type = $${paramIndex++}`);
    params.push(filters.entityType);
  }
  if (filters.entityId) {
    conditions.push(`entity_id = $${paramIndex++}`);
    params.push(filters.entityId);
  }
  if (filters.action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(filters.action);
  }
  if (filters.performedBy) {
    conditions.push(`performed_by = $${paramIndex++}`);
    params.push(filters.performedBy);
  }
  if (filters.performedByType) {
    conditions.push(`performed_by_type = $${paramIndex++}`);
    params.push(filters.performedByType);
  }
  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }
  const tenantId = filters.businessId || filters.tenantId;
  if (tenantId) {
    conditions.push(`business_id = $${paramIndex++}`);
    params.push(tenantId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where: whereClause, params };
}

export async function getAuditLogs(filters: AuditLogFilters): Promise<{ data: AuditLog[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const { where, params } = buildWhereClause(filters);

  const countQuery = `SELECT COUNT(*) as total FROM audit_logs ${where}`;
  const countResult = await query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataQuery = `
    SELECT id, business_id, entity_type, entity_id, action, performed_by, performed_by_type, description, old_values, new_values, metadata, ip_address, user_agent, created_at
    FROM audit_logs
    ${where}
    ORDER BY created_at ${sortOrder}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query<AuditLog>(dataQuery, [...params, limit, offset]);

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

export async function createAuditLog(
  entityType: string,
  action: string,
  performedBy: string | null,
  performedByType: string,
  description: string,
  oldValues?: unknown,
  newValues?: unknown,
  metadata: Record<string, unknown> = {},
  ipAddress?: string,
  userAgent?: string,
  businessId?: string
): Promise<void> {
  // Validate tenant BEFORE the try/catch: a missing businessId is a programming
  // error and must propagate to the caller (and its test), while DB/runtime
  // failures inside try are logged and swallowed so audit failures never break
  // the request flow.
  const resolvedTenant = businessId || (metadata?.business_id as string) || (metadata?.tenantId as string) || null;
  if (!resolvedTenant) {
    throw new BadRequestError('businessId is required for audit logging');
  }

  try {
    await query(
      `INSERT INTO audit_logs (entity_type, action, performed_by, performed_by_type, description, old_values, new_values, metadata, ip_address, user_agent, business_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entityType,
        action,
        performedBy,
        performedByType,
        description,
        oldValues || null,
        newValues || null,
        metadata,
        ipAddress || null,
        userAgent || null,
        resolvedTenant,
      ]
    );
  } catch (error) {
    logger.error('Failed to create audit log', { error });
    // Genuine DB failures are logged and swallowed so audit logging never
    // breaks the request flow.
  }
}
