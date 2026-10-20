import { Router, Response, Request, NextFunction } from 'express';
import { z } from 'zod';
import { validateWebhookSource, WebhookRequest } from '../middleware/webhookAuth';
import { webhookRateLimiter, createWebhookSourceRateLimiter } from '../middleware/rateLimiter';
import { BadRequestError } from '../utils/errors';
import logger from '../utils/logger';
import { stripeProvider } from '../services/billing';
import { requireFeatureLimit, incrementUsage, requirePlanFeature } from '../services/subscription.service';
import { PaymentRequiredError } from '../utils/errors';
import { acceptQuoteFromWebhook, sendQuotePdfToCustomer } from '../services/quote.service';
import { createAuditLog } from '../services/audit.service';
import { query } from '../utils/database';
import { sendWahaText, resolveWahaChatId } from '../services/waha.service';
import { config } from '../config';
import { bookAppointment } from '../services/appointment.service';
import { deriveAndSaveLeadScore } from '../services/leadScore.service';

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

const quoteAcceptSchema = z.object({
  conversation_id: z.string().uuid(),
  business_id: z.string().uuid().optional(),
});

const appointmentBookSchema = z.object({
  business_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferred_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.number().int().min(15).max(480).default(60),
  appointment_type: z.enum(['consultation', 'site_visit', 'installation', 'follow_up', 'delivery', 'other']).default('consultation'),
  title: z.string().min(1).max(255).default('Appointment'),
  location: z.string().max(1000).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  assigned_to: z.string().uuid().optional(),
});

const quoteSendSchema = z.object({
  quote_id: z.string().uuid(),
  business_id: z.string().uuid(),
});

const leadScoreSchema = z.object({
  contact_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  intent: z.string().optional(),
  lead_stage: z.string().optional(),
  sentiment: z.string().optional(),
  facts_extracted: z.array(z.unknown()).optional(),
  escalate: z.boolean().optional(),
  escalation_reason: z.string().optional(),
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
            res.status(402).json({ success: false, message: `AI reply quota exceeded: ${error.message}` });
            return;
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

/**
 * Handle quote acceptance from customer reply.
 * Called by n8n when a customer replies 'yes', 'I accept', or similar.
 * Expected payload: { conversation_id, contact_id, business_id, message }
 */
router.post(
  '/quotes/send',
  validateWebhookSource({ secretEnvVarName: 'N8N_WEBHOOK_SECRET', sourceName: 'n8n quote delivery' }),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = quoteSendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Valid quote_id and business_id are required' });
      return;
    }
    try {
      const result = await sendQuotePdfToCustomer(parsed.data.quote_id, parsed.data.business_id);
      res.json({ success: true, data: result });
    } catch (error: any) {
      const status = Number(error?.statusCode) || 500;
      res.status(status).json({ success: false, error: error?.message || 'Quote PDF delivery failed' });
    }
  }
);

router.post(
  '/appointments/book',
  validateWebhookSource({ secretEnvVarName: 'N8N_WEBHOOK_SECRET', sourceName: 'n8n appointment booking' }),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = appointmentBookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors.map((entry) => entry.message).join(', ') });
      return;
    }

    try {
      const input = parsed.data;
      await requirePlanFeature(input.business_id, 'appointments');
      const booked = await bookAppointment({
        businessId: input.business_id,
        contactId: input.contact_id,
        conversationId: input.conversation_id,
        preferredDate: input.preferred_date,
        preferredTime: input.preferred_time,
        durationMinutes: input.duration_minutes,
        appointmentType: input.appointment_type,
        title: input.title,
        location: input.location,
        description: input.description,
        assignedTo: input.assigned_to,
      });

      const startsAt = new Date(booked.appointment.starts_at);
      const timeLabel = startsAt.toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: booked.timezone,
      });
      let customerConfirmationSent = false;
      let staffNotified = false;
      const customerChatId = resolveWahaChatId({ phone: booked.customerPhone, wa_lid: booked.customerWaLid, wa_chat_id: booked.customerWaChatId });
      if (customerChatId) {
        try {
          await sendWahaText({
            session: booked.wahaSession || config.waha.session || 'default',
            chatId: customerChatId,
            text: `Your ${booked.appointment.title} with ${booked.businessName} is confirmed for ${timeLabel}${booked.appointment.location ? ` at ${booked.appointment.location}` : ''}.`,
          });
          customerConfirmationSent = true;
        } catch (error) {
          logger.warn('Appointment created but customer confirmation could not be sent', {
            appointmentId: booked.appointment.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      const staffPhoneDigits = booked.assignedPhone?.replace(/\D/g, '') || '';
      const customerDigits = booked.customerPhone.replace(/\D/g, '');
      if (staffPhoneDigits && staffPhoneDigits !== customerDigits) {
        try {
          await sendWahaText({
            session: booked.wahaSession || config.waha.session || 'default',
            chatId: `${staffPhoneDigits}@c.us`,
            text: `New appointment assigned to you: ${booked.appointment.title}, ${timeLabel}. Customer: ${booked.customerName}, ${booked.customerPhone}${booked.appointment.location ? `, location: ${booked.appointment.location}` : ''}.`,
          });
          staffNotified = true;
        } catch (error) {
          logger.warn('Appointment created but staff WhatsApp notification failed', {
            appointmentId: booked.appointment.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      await createAuditLog(
        'appointments', 'create', null, 'system', 'Appointment booked from an AI WhatsApp conversation',
        undefined, { appointmentId: booked.appointment.id, assignedTo: booked.appointment.assigned_to },
        { conversationId: input.conversation_id, source: 'n8n' }, req.ip, req.get('user-agent'), input.business_id
      );
      res.status(201).json({
        success: true,
        data: {
          appointment: booked.appointment,
          localTimeLabel: timeLabel,
          assignedTo: booked.appointment.assigned_to,
          assignedName: booked.assignedName,
          customerConfirmationSent,
          staffNotified,
        },
      });
    } catch (error: any) {
      const status = Number(error?.statusCode) || 500;
      res.status(status).json({ success: false, error: error?.message || 'Could not book appointment' });
    }
  }
);

router.post(
  '/quote-accept',
  validateWebhookSource({ secretEnvVarName: 'N8N_WEBHOOK_SECRET', sourceName: 'n8n quote acceptance' }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = quoteAcceptSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'Valid conversation_id and optional business_id are required' });
        return;
      }
      const { conversation_id, business_id } = parsed.data;

      const result = await acceptQuoteFromWebhook(conversation_id, business_id);

      if (!result.success) {
        res.json({ success: false, error: 'No active quote found for this conversation' });
        return;
      }

      let customerNotified = false;
      try {
        const details = await query<{ phone: string; wa_lid: string | null; wa_chat_id: string | null; waha_session_name: string | null }>(
          `SELECT ct.phone, ct.wa_lid, ct.wa_chat_id, b.waha_session_name
           FROM contacts ct
           JOIN businesses b ON b.id = ct.business_id
           WHERE ct.id = $1 AND ct.business_id = $2`,
          [result.contactId, result.businessId]
        );
        const customer = details.rows[0];
        if (customer?.phone) {
          const chatId = resolveWahaChatId(customer);
          if (chatId) {
            await sendWahaText({
              session: customer.waha_session_name || config.waha.session || 'default',
              chatId,
              text: 'Thanks, your quote has been accepted. The business team will follow up with you shortly.',
            });
            customerNotified = true;
          }
        }
      } catch (notificationError) {
        logger.warn('Quote accepted but customer notification failed', {
          quoteId: result.quoteId,
          error: notificationError instanceof Error ? notificationError.message : 'Unknown error',
        });
      }

      // Create audit log entry
      await createAuditLog(
        'quotes',
        'update_status',
        result.contactId || null,
        'system',
        'Quote accepted via customer reply',
        undefined,
        { accepted_via: 'webhook', conversation_id },
        result.quoteId ? { quoteId: result.quoteId } : undefined,
        req.ip!,
        req.get('user-agent')!,
        result.businessId
      );

      res.json({ success: true, quoteId: result.quoteId, customerNotified, message: 'Quote marked as accepted' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * n8n webhook: derive and persist a lead score from the AI Brain's
 * qualitative output. Reuses deriveAndSaveLeadScore so scoring logic
 * lives in the backend (weighted model + CRM sync + audit trail) and is
 * never written as hardcoded zeros.
 *
 * Auth: shared secret via X-Webhook-Secret (N8N_WEBHOOK_SECRET) plus
 * X-Timestamp replay protection.
 */
router.post(
  '/lead-score',
  webhookRateLimiter,
  validateWebhookSource({
    sourceName: 'n8n-lead-score',
    secretHeaderName: 'x-webhook-secret',
    secretEnvVarName: 'N8N_WEBHOOK_SECRET',
  }),
  async (req: WebhookRequest, res: Response): Promise<void> => {
    const parseResult = leadScoreSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(`Malformed lead-score webhook payload: ${parseResult.error.errors.map((e) => e.message).join(', ')}`);
    }
    const { contact_id, conversation_id, business_id, intent, lead_stage, sentiment, facts_extracted, escalate, escalation_reason } = parseResult.data;
    const score = await deriveAndSaveLeadScore({
      contactId: contact_id,
      conversationId: conversation_id || null,
      businessId: business_id,
      intent,
      leadStage: lead_stage,
      sentiment,
      factsExtracted: facts_extracted || [],
      escalate,
      escalationReason: escalation_reason,
    });
    res.status(200).json({ success: true, data: score });
  }
);

export default router;

router.post(
  '/stripe',
  webhookRateLimiter,
  async (req: WebhookRequest, res: Response): Promise<void> => {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    try {
      await stripeProvider.handleWebhook!(rawBody, req.headers as Record<string, string | string[] | undefined>);
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

