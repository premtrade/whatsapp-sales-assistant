import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config } from '../config';
import logger from '../utils/logger';
import { UnauthorizedError, BadRequestError, AppError } from '../utils/errors';
import { getSubscriptionState, assertAiQuotaAvailable, recordAiResponse } from '../services/entitlement.service';
import { sendMessage } from '../services/message.service';

/**
 * Internal AI pipeline endpoints (called by the n8n "AI Brain" workflows with
 * a shared secret header, NOT by end users). Closes the metering loop:
 *   - POST /ai-quota-check  : gate BEFORE the LLM call (saves token spend on
 *                             expired trials / exhausted quotas)
 *   - POST /ai-reply        : persist + send the generated reply as
 *                             sender_type='ai', metered exactly once (wamid
 *                             dedupe), tenant-scoped WAHA session.
 */

const requireInternalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const key = req.headers['x-internal-api-key'];
  if (!config.internalApiKey || key !== config.internalApiKey) {
    next(new UnauthorizedError('Invalid internal API key', 'INTERNAL_AUTH_FAILED'));
    return;
  }
  next();
};

const businessIdSchema = z.string().uuid('businessId must be a UUID');

const quotaCheckSchema = z.object({
  businessId: businessIdSchema,
});

const aiReplySchema = z.object({
  businessId: businessIdSchema,
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(10000),
  whatsappMessageId: z.string().nullish(), // wamid of the inbound message that triggered the reply
  metadata: z.record(z.unknown()).optional(),
});

const router = Router();

router.use(requireInternalAuth);

// Pre-generation gate: returns 200 when the tenant may receive an AI reply.
router.post('/ai-quota-check', async (req: Request, res: Response): Promise<void> => {
  const { businessId } = quotaCheckSchema.parse(req.body) as { businessId: string };

  const state = await assertAiQuotaAvailable(businessId);
  const used = await (async () => {
    const { getUsage } = await import('../services/entitlement.service');
    return getUsage(state.subscriptionId, 'ai_responses');
  })();

  res.json({
    success: true,
    data: {
      allowed: true,
      planCode: state.planCode,
      status: state.status,
      aiResponsesUsed: used,
      aiResponsesLimit: state.aiResponsesLimit,
    },
  });
});

// Persist + deliver an AI-generated reply, metered exactly once.
router.post('/ai-reply', async (req: Request, res: Response): Promise<void> => {
  const parsed = aiReplySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues.map((i) => i.message).join(', '));
  }
  const { businessId, conversationId, text, whatsappMessageId, metadata } = parsed.data;

  // Idempotency: if this inbound wamid already produced a reply, don't send twice.
  if (whatsappMessageId) {
    const existing = await (await import('../utils/database')).query<{ id: string }>(
      `SELECT m.id FROM messages m
        WHERE m.metadata->>'triggerWamid' = $1 AND m.sender_type = 'ai'
        LIMIT 1`,
      [whatsappMessageId]
    );
    if (existing.rowCount && existing.rows.length > 0) {
      logger.info('ai-reply duplicate suppressed', { triggerWamid: whatsappMessageId });
      res.status(200).json({ success: true, data: { messageId: existing.rows[0]!.id, deduplicated: true } });
      return;
    }
  }

  // Final entitlement check immediately before sending (quota may have been
  // consumed between /ai-quota-check and now).
  await assertAiQuotaAvailable(businessId);

  const message = await sendMessage(conversationId, text, 'ai-pipeline', {
    ...metadata,
    triggerWamid: whatsappMessageId ?? null,
    generatedBy: 'n8n-ai-brain',
  }, { businessId, senderType: 'ai' });

  // Belt-and-braces: ensure the counter exists even if sendMessage's internal
  // recording path changes later. recordAiResponse is dedupe-safe.
  await recordAiResponse(businessId, `msg:${message.id}`);

  res.status(201).json({ success: true, data: message });
});

// Read-only subscription snapshot for the workflows' handoff logic.
router.get('/subscription/:businessId', async (req: Request, res: Response): Promise<void> => {
  const businessId = businessIdSchema.parse(req.params.businessId);
  const state = await getSubscriptionState(businessId);
  if (!state) {
    throw new AppError('No subscription for this workspace', 404, 'NO_SUBSCRIPTION');
  }
  const { getUsage } = await import('../services/entitlement.service');
  res.json({
    success: true,
    data: {
      planCode: state.planCode,
      status: state.status,
      trialEndAt: state.trialEndAt,
      aiResponsesUsed: await getUsage(state.subscriptionId, 'ai_responses'),
      aiResponsesLimit: state.aiResponsesLimit,
    },
  });
});

export default router;
