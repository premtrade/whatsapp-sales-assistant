import { Request } from 'express';
import { UserPayload } from '../types';

/**
 * Tenant scoping helpers.
 *
 * WAFLO is a multi tenant app: every document, conversation, quote and
 * knowledge chunk belongs to exactly one business. A tenant user is scoped to
 * the tenant in their token. The platform owner (super_admin) has no tenant of
 * their own and selects one with the X-Tenant-Id header - that is what the
 * dashboard's tenant selector sends, so a document can never be written to
 * the wrong tenant by accident.
 */

export function headerTenantId(req: Request): string | undefined {
  const raw = req.headers['x-tenant-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : undefined;
}

export function resolveRequestTenant(req: Request): string | undefined {
  const user = (req as Request & { user?: UserPayload }).user;
  const jwtTenant = user?.businessId || user?.tenantId;
  if (jwtTenant) {
    return jwtTenant;
  }
  return headerTenantId(req);
}
