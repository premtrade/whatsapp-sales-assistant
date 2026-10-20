import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuth } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { buildAiContext, buildGreetingReply, getBusinessIdentity } from '../services/aiContext.service';
import { BadRequestError, ForbiddenError } from '../utils/errors';
import logger from '../utils/logger';

const router = Router();

const contextSchema = z.object({
  businessId: z.string().uuid('businessId must be a UUID'),
  message: z.string().max(4000).optional().default(''),
  limit: z.number().int().positive().max(50).optional(),
  includeKnowledge: z.boolean().optional().default(true),
});

/**
 * GET /api/ai/identity
 * The identity the assistant is allowed to use for a tenant. Every tenant gets
 * its own name back - the assistant must never answer with another tenant's
 * name (or a made up one).
 */
router.get('/identity', async (req: any, res: Response): Promise<void> => {
  try {
    const businessId = String(req.query.businessId || req.user?.businessId || req.user?.tenantId || '');
    if (!businessId) {
      throw new BadRequestError('businessId is required');
    }
    if (req.user && req.user.role !== 'super_admin') {
      const tenantId = req.user.businessId || req.user.tenantId;
      if (tenantId && tenantId !== businessId) {
        throw new ForbiddenError('Tenant scope required');
      }
    }
    const identity = await getBusinessIdentity(businessId);
    res.json({
      success: true,
      data: {
        ...identity,
        greetingReply: buildGreetingReply(identity),
      },
    });
  } catch (error: any) {
    logger.error('AI identity lookup failed', { error: error?.message || error });
    res.status(error?.statusCode || 500).json({ success: false, message: error?.message || 'Failed to resolve business identity' });
  }
});

/**
 * POST /api/ai/context
 * Builds the complete, tenant scoped context the assistant needs: the business
 * identity, the deterministic greeting and the knowledge chunks for the
 * question. The workflow calls this so the prompt no longer depends on n8n
 * expression interpolation (which silently produced empty values and made the
 * model invent a company name).
 */
router.post('/context', apiRateLimiter, optionalAuth, async (req: any, res: Response): Promise<void> => {
  try {
    const validated = contextSchema.parse(req.body);
    if (req.user && req.user.role !== 'super_admin') {
      const tenantId = req.user.businessId || req.user.tenantId;
      if (tenantId && tenantId !== validated.businessId) {
        throw new ForbiddenError('Tenant scope required');
      }
    }
    const context = await buildAiContext({
      businessId: validated.businessId,
      message: validated.message,
      limit: validated.limit,
      includeKnowledge: validated.includeKnowledge,
    });
    res.json({ success: true, data: context });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      res.status(400).json({ success: false, message: error.errors.map((e: any) => e.message).join(', ') });
      return;
    }
    logger.error('AI context build failed', { error: error?.message || error });
    res.status(error?.statusCode || 500).json({ success: false, message: error?.message || 'Failed to build AI context' });
  }
});

/**
 * GET /api/ai/identity/self - the tenant of the authenticated user.
 */
router.get('/identity/self', authenticate, async (req: any, res: Response): Promise<void> => {
  try {
    const businessId = req.user?.businessId || req.user?.tenantId;
    if (!businessId) {
      throw new ForbiddenError('Tenant scope required');
    }
    const identity = await getBusinessIdentity(businessId);
    res.json({ success: true, data: { ...identity, greetingReply: buildGreetingReply(identity) } });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ success: false, message: error?.message || 'Failed to resolve business identity' });
  }
});

export default router;
