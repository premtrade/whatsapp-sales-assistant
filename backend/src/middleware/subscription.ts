import { Request, Response, NextFunction } from 'express';
import { getActiveSubscription, assertUsable, requireFeatureLimit, trialDaysLeft } from '../services/subscription.service';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

export interface SubscriptionScopedRequest extends Request {
  subscription?: unknown;
}

/**
 * Tenant scope for subscription enforcement.
 * Returns null when enforcement must be skipped:
 * - unauthenticated request (no user attached yet)
 * - super_admin platform session (never gated by tenant billing state)
 * - session without tenant scope (fail open; tenant-scoped queries still enforce scoping)
 */
function tenantScope(req: Request): string | null {
  const user = (req as AuthenticatedRequest).user;
  if (!user) return null;
  if (user.role === 'super_admin') return null;
  return user.businessId || user.tenantId || null;
}

/**
 * Blocks tenant-scoped requests while the subscription is not usable
 * (missing, expired trial, past_due beyond grace, canceled, expired).
 * Deliberate enforcement decisions surface as 402/403 via AppError;
 * infrastructure errors fail open with a warning so a billing table
 * outage or unapplied migration cannot take down tenant APIs.
 */
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tenantId = tenantScope(req);
  if (!tenantId) {
    next();
    return;
  }

  try {
    const sub = await getActiveSubscription(tenantId);
    assertUsable(sub);
    (req as SubscriptionScopedRequest).subscription = sub;
    if (sub && sub.status === 'trialing') {
      res.locals.trialDaysLeft = trialDaysLeft(sub);
    }
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    logger.warn('Subscription enforcement skipped due to unexpected error', {
      tenantId,
      path: req.path,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next();
  }
}

export function requireUsageLimit(metric: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const tenantId = tenantScope(req);
    if (!tenantId) {
      next();
      return;
    }
    try {
      await requireFeatureLimit(tenantId, metric);
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      logger.warn('Usage limit check skipped due to unexpected error', {
        tenantId,
        metric,
        path: req.path,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next();
    }
  };
}
