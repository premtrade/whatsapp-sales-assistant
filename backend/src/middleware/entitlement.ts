import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { assertAccessAllowed, SubscriptionState } from '../services/entitlement.service';

/**
 * Item 2 — Tenant-scoped entitlement middleware.
 * Resolves req.user.businessId (from JWT) and enforces subscription state
 * (trial expiry / suspension / cancellation) before the handler runs.
 * Attaches the resolved subscription to req.subscription for downstream use.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      subscription?: SubscriptionState;
    }
  }
}

export const requireEntitlement = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const businessId = req.user.businessId ?? req.headers['x-business-id'];
    if (!businessId || typeof businessId !== 'string') {
      // Legacy tokens minted before multi-tenancy rollout: deny on API routes
      // that carry tenant data rather than falling back to a global scope.
      throw new ForbiddenError(
        'Token is missing workspace context. Please log in again.',
        'MISSING_TENANT_CONTEXT'
      );
    }

    req.subscription = await assertAccessAllowed(businessId);
    next();
  } catch (error) {
    next(error);
  }
};
