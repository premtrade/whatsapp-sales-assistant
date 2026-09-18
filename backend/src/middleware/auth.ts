import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { AuthenticatedRequest } from '../types';
import { query } from '../utils/database';
import { createAuditLog } from '../services/audit.service';
import logger from '../utils/logger';

export const authenticate = async (
  req: any,
  res: any,
  next: any
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedError('Missing token');
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any;

    const userId = (decoded.userId || decoded.id) as string;
    const userResult = await query(
      `SELECT id, email, role, status, business_id, employee_number, first_name, last_name
       FROM staff_users
       WHERE id = $1 AND status = 'active'`,
      [userId]
    );

    const dbUser = userResult.rows[0];

    if (!dbUser) {
      throw new UnauthorizedError('User not found or inactive');
    }

    const tokenBusinessId = (decoded.businessId || decoded.tenantId || decoded.business_id) as string | undefined;
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    const userRole = (decoded.role as string) || dbUser.role || '';

    let effectiveTenantId = dbUser.business_id || tokenBusinessId;
    let impersonated = false;

    if (userRole === 'super_admin' && headerTenantId) {
      // Verify the target tenant exists
      const targetTenantResult = await query(
        `SELECT id FROM businesses WHERE id = $1 AND status = 'active'`,
        [headerTenantId]
      );
      if (targetTenantResult.rows.length > 0) {
        effectiveTenantId = headerTenantId;

        // Audit log for impersonation
        await createAuditLog(
          'auth',
          'tenant_impersonation',
          dbUser.id,
          'staff',
          `Super-admin impersonated tenant ${headerTenantId}`,
          undefined,
          { targetTenantId: headerTenantId, originalTenantId: dbUser.business_id },
          { impersonation: true },
          req.ip,
          req.get('user-agent')
        );

        logger.info('Super-admin impersonated tenant', {
          adminId: dbUser.id,
          originalTenantId: dbUser.business_id,
          targetTenantId: headerTenantId,
        });
      } else {
        logger.warn('Super-admin attempted to impersonate non-existent tenant', {
          adminId: dbUser.id,
          targetTenantId: headerTenantId,
        });
      }
    } else if (headerTenantId && userRole !== 'super_admin') {
      // Non-super-admin attempting impersonation - log and ignore
      logger.warn('Non-super-admin attempted tenant impersonation', {
        userId: dbUser.id,
        role: userRole,
        attemptedTenantId: headerTenantId,
      });
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      employeeNumber: dbUser.employee_number,
      firstName: dbUser.first_name || '',
      lastName: dbUser.last_name || '',
      businessId: effectiveTenantId,
      tenantId: effectiveTenantId,
    };
    next();
  } catch (error: any) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
      return;
    }
    next(error);
  }
};

export const optionalAuth = async (
  req: any,
  res: any,
  next: any
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        const userId = (decoded.userId || decoded.id) as string;

        const userResult = await query(
          `SELECT id, email, role, status, business_id, employee_number, first_name, last_name
           FROM staff_users
           WHERE id = $1 AND status = 'active'`,
          [userId]
        );

        const dbUser = userResult.rows[0];
        if (dbUser) {
          req.user = {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            employeeNumber: dbUser.employee_number,
            firstName: dbUser.first_name || '',
            lastName: dbUser.last_name || '',
            businessId: dbUser.business_id,
            tenantId: dbUser.business_id,
          };
        } else {
          req.user = {
            id: (decoded.userId || decoded.id) as string,
            email: (decoded.email as string) || '',
            role: (decoded.role as string) || '',
            businessId: (decoded.businessId || decoded.tenantId || decoded.business_id) as string | undefined,
            tenantId: (decoded.businessId || decoded.tenantId || decoded.business_id) as string | undefined,
          };
        }
      }
    }
  } catch {
      // Silently ignore invalid tokens for optional auth
    }
    next();
  };
export function requireRole(...roles: string[]) {
  return (req: any, _res: any, next: any): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Insufficient permissions. Requires: ${roles.join(', ')}`);
    }
  };
}

export function requireTenant(req: any, _res: any, next: any): void {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  const tenantId = req.user?.businessId || req.user?.tenantId;
  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required for this resource');
  }
}

export function getTenantId(req: any): string {
  const tenantId = req.user?.businessId || req.user?.tenantId;
  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }
  return tenantId;
}