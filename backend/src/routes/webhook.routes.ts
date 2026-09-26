import { Router, Response, Request, NextFunction } from 'express';
import { z } from 'zod';
import { validateWebhookSource, WebhookRequest } from '../middleware/webhookAuth';
import { webhookRateLimiter, createWebhookSourceRateLimiter } from '../middleware/rateLimiter';
import { BadRequestError } from '../utils/errors';
import logger from '../utils/logger';
import { handleStripeWebhook } from '../services/stripe.service';
import { requireFeatureLimit, incrementUsage } from '../services/subscription.service';
import { PaymentRequiredError } from '../utils/errors';

const router = Router();

// Raw body parser for HMAC verification - must be before express.json()
router.use((req: Request, res: Response, next: NextFunction) => {
  const rawBodyChunks: Buffer[] = [];
  req.on('data', (chunk) => rawBodyChunks.push(chunk));
  req.on('end', () => {
    (req as WebhookRequest).rawBody = Buffer.concat(rawBodyChunks);
    next();
  });
});

router.use(webhookRateLimiter);

// Per-source rate limiters
const wahaSourceRateLimiter = createWebhookSourceRateLimiter('WAHA', 60, 60 * 1000);
const n8nSourceRateLimiter = createWebhookSourceRateLimiter('n8n', 60, 60 * 1000);

// WAHA Webhook Payload Schema
const wahaWebhookSchema = z.object({
  event: z.string().min(1),
  session: z.string().optional().default('default'),
  payload: z.record(z.unknown()),
  engine: z.string().optional(),
});

// n8n Webhook Payload Schema
const n8nWebhookSchema = z.object({
  event: z.string().min(1),
  tenantId: z.string().optional(),
  data: z.record(z.unknown()),
  timestamp: z.string().optional(),
});

// Type for webhook processing config
interface WebhookProcessingConfig {
  forwardToN8n?: boolean;
  n8nWebhookUrl?: string;
  internalHandler?: (req: WebhookRequest, res: Response) => Promise<void>;
}

/**
 * Inbound webhook from WAHA (WhatsApp HTTP API).
 * Validates source authenticity using X-Webhook-Secret / X-Signature-256 (fallback to X-API-Key).
 */
router.post(
  '/waha',
  wahaSourceRateLimiter,
  validateWebhookSource({
    sourceName: 'WAHA',
    secretHeaderName: 'x-webhook-secret',
    signatureHeaderName: 'x-signature-256',
    secretEnvVarName: 'WAHA_WEBHOOK_SECRET',
    defaultSecret: process.env.WAHA_API_KEY,
  }),
  async (req: WebhookRequest, res: Response): Promise<void> => {
    const parseResult = wahaWebhookSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn('Malformed WAHA webhook payload rejected', {
        errors: parseResult.error.errors,
      });
      throw new BadRequestError(`Malformed webhook payload: ${parseResult.error.errors.map(e => e.message).join(', ')}`);
    }

    const { event, session, payload } = parseResult.data;
    logger.info(`Received validated WAHA event: ${event}`, { session });

    // Configurable processing: forward to n8n or handle internally
    const forwardToN8n = process.env.WAHA_WEBHOOK_FORWARD_TO_N8N === 'true';
    const n8nUrl = process.env.N8N_WEBHOOK_URL;

    if (forwardToN8n && n8nUrl) {
      try {
        await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, session, payload, source: 'waha' }),
        });
        logger.info('Forwarded WAHA event to n8n', { event, n8nUrl });
      } catch (err) {
        logger.error('Failed to forward WAHA event to n8n', { error: err });
        // Don't fail the webhook - n8n processing is async
      }
    }

    // Internal processing could be added here (e.g., emit to WebSocket, process message)
    // For now, just acknowledge

    // Acknowledge receipt immediately for webhook contracts
    res.status(200).json({
      success: true,
      message: 'Event accepted',
      receivedEvent: event,
      session,
    });
  }
);

/**
 * Inbound webhook / callback from n8n or internal automation workflows.
 * Requires HMAC signature or X-Webhook-Secret.
 */
router.post(
  '/n8n',
  n8nSourceRateLimiter,
  validateWebhookSource({
    sourceName: 'n8n',
    secretHeaderName: 'x-webhook-secret',
    signatureHeaderName: 'x-signature-256',
    secretEnvVarName: 'N8N_WEBHOOK_SECRET',
    defaultSecret: process.env.N8N_ENCRYPTION_KEY,
  }),
  async (req: WebhookRequest, res: Response): Promise<void> => {
    const parseResult = n8nWebhookSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn('Malformed n8n webhook payload rejected', {
        errors: parseResult.error.errors,
      });
      throw new BadRequestError(`Malformed webhook payload: ${parseResult.error.errors.map(e => e.message).join(', ')}`);
    }

    const { event, tenantId } = parseResult.data;
    logger.info(`Received validated n8n event: ${event}`, { tenantId });

    if (event === 'ai_reply') {
      const businessId = (req.body.data && (req.body.data.business_id || req.body.data.businessId)) || tenantId;
      if (businessId) {
        try {
          await requireFeatureLimit(businessId, 'ai_responses');
          await incrementUsage(businessId, 'ai_responses');
          logger.info('AI reply usage tracked', { businessId, event });
        } catch (error) {
          if (error instanceof PaymentRequiredError) {
            logger.warn('AI reply quota exceeded', { businessId, error: error.message });
          } else {
            logger.error('Failed to track AI reply usage', { businessId, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      }
    }

    // Internal processing for n8n callbacks
    // Could trigger internal workflows, update state, etc.

    res.status(200).json({
      success: true,
      message: 'Workflow callback processed',
      event,
    });
  }
);

export default router;

router.post(
  '/stripe',
  webhookRateLimiter,
  async (req: WebhookRequest, res: Response): Promise<void> => {
    const signature = (req.headers['stripe-signature'] as string) || '';
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    try {
      await handleStripeWebhook(rawBody, signature);
    } catch (error: any) {
      if (error instanceof BadRequestError) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      throw error;
    }
    res.status(200).json({ success: true, message: 'Webhook accepted' });
  }
);

