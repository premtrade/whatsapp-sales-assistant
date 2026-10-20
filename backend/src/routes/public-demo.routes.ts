import { Router, Response } from 'express';
import { query } from '../utils/database';
import logger from '../utils/logger';
import { DEMO_SLUG } from '../services/demoSeed.data';

/**
 * Public, read-only demo API.
 *
 * Exposes the demo tenant so a visitor can see the product working without
 * an account. This is the most dangerous surface in the product: it is
 * unauthenticated, so it must never be able to read anything that is not the
 * demo tenant.
 *
 * Two rules keep it safe:
 *
 *   1. The tenant is resolved from a fixed slug, never from anything the
 *      caller sends. There is no business id, tenant id or header the client
 *      can influence.
 *   2. Every statement filters on that business id, and the demo tenant is
 *      marked `metadata->>'is_demo' = true` as well, so a slug collision with
 *      a real business cannot leak it.
 */

export const publicDemoRouter = Router();

/** Resolves the demo business id. Returns null when it has not been seeded. */
async function resolveDemoBusinessId(): Promise<string | null> {
  const result = await query<{ id: string }>(
    `SELECT id FROM businesses
      WHERE slug = $1 AND metadata->>'is_demo' = 'true' AND deleted_at IS NULL
      LIMIT 1`,
    [DEMO_SLUG]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * The full demo: the showcase conversation, its lead score, the quote, and
 * the operating numbers a visitor would see in the dashboard.
 */
publicDemoRouter.get('/demo', async (_req, res: Response): Promise<void> => {
  try {
    const businessId = await resolveDemoBusinessId();
    if (!businessId) {
      res.status(404).json({ success: false, message: 'The demo has not been set up yet.' });
      return;
    }

    const business = await query<{
      name: string;
      description: string | null;
      currency: string;
      timezone: string;
      whatsapp_phone: string | null;
    }>(
      `SELECT name, description, currency, timezone, whatsapp_phone FROM businesses WHERE id = $1`,
      [businessId]
    );
    const row = business.rows[0];

    // The showcase conversation is the one with the most messages.
    const conversation = await query<{
      id: string;
      contact_name: string | null;
      contact_phone: string | null;
      lead_score: number | null;
      lead_status: string | null;
      project_type: string | null;
      estimated_budget: string | null;
      project_location: string | null;
      quote_number: string | null;
      quote_total: string | null;
      quote_currency: string | null;
      quote_status: string | null;
      started_at: Date;
    }>(
      `SELECT c.id, ct.display_name AS contact_name, ct.phone AS contact_phone,
              ls.total_score AS lead_score, ls.status AS lead_status,
              ls.project_type, ls.estimated_budget, ls.project_location,
              q.quote_number, q.total AS quote_total, q.currency AS quote_currency, q.status AS quote_status,
              c.started_at
         FROM conversations c
         JOIN contacts ct ON ct.id = c.contact_id
         LEFT JOIN lead_scores ls ON ls.contact_id = c.contact_id AND ls.business_id = c.business_id
         LEFT JOIN quotes q ON q.contact_id = c.contact_id AND q.business_id = c.business_id
        WHERE c.business_id = $1
        ORDER BY (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) DESC,
                 c.last_message_at DESC
        LIMIT 1`,
      [businessId]
    );

    const showcase = conversation.rows[0];
    if (!showcase) {
      res.status(404).json({ success: false, message: 'The demo has not been set up yet.' });
      return;
    }

    const messages = await query<{
      direction: string;
      sender_type: string;
      text_body: string | null;
      created_at: Date;
      metadata: Record<string, unknown>;
    }>(
      `SELECT direction, sender_type, text_body, created_at, metadata
         FROM messages
        WHERE conversation_id = $1 AND business_id = $2
        ORDER BY created_at ASC`,
      [showcase.id, businessId]
    );

    const appointment = await query<{
      title: string;
      appointment_type: string;
      status: string;
      starts_at: Date;
      location: string | null;
    }>(
      `SELECT title, appointment_type, status, starts_at, location
         FROM appointments
        WHERE conversation_id = $1 AND business_id = $2
        ORDER BY starts_at ASC LIMIT 1`,
      [showcase.id, businessId]
    );

    const stats = await query<{
      conversations: string;
      ai_replies: string;
      quotes: string;
      quote_value: string;
      appointments: string;
      lead_score: string;
    }>(
      `SELECT
         (SELECT count(*) FROM conversations WHERE business_id = $1) AS conversations,
         (SELECT count(*) FROM messages WHERE business_id = $1 AND sender_type = 'ai') AS ai_replies,
         (SELECT count(*) FROM quotes WHERE business_id = $1 AND status <> 'draft') AS quotes,
         (SELECT COALESCE(sum(total),0) FROM quotes WHERE business_id = $1 AND status <> 'draft') AS quote_value,
         (SELECT count(*) FROM appointments WHERE business_id = $1 AND status IN ('scheduled','confirmed')) AS appointments,
         (SELECT COALESCE(round(avg(total_score)),0) FROM lead_scores WHERE business_id = $1) AS lead_score`,
      [businessId]
    );

    const products = await query<{ name: string; price: string; currency: string; unit: string }>(
      `SELECT name, price, currency, unit FROM products
        WHERE business_id = $1 AND active = TRUE
        ORDER BY price ASC LIMIT 4`,
      [businessId]
    );

    res.json({
      success: true,
      data: {
        business: {
          name: row?.name,
          description: row?.description,
          currency: row?.currency,
          timezone: row?.timezone,
          /** The number a visitor can message. Null until a live demo number
           *  has been paired to the demo tenant. */
          whatsappPhone: row?.whatsapp_phone,
        },
        conversation: {
          contactName: showcase.contact_name,
          leadScore: showcase.lead_score,
          leadStatus: showcase.lead_status,
          projectType: showcase.project_type,
          estimatedBudget: showcase.estimated_budget,
          projectLocation: showcase.project_location,
          startedAt: showcase.started_at,
          messages: messages.rows.map((m) => ({
            direction: m.direction,
            senderType: m.sender_type,
            text: m.text_body,
            createdAt: m.created_at,
            document: Boolean((m.metadata as Record<string, unknown>)?.document),
          })),
        },
        quote: showcase.quote_number
          ? {
              number: showcase.quote_number,
              total: Number(showcase.quote_total),
              currency: showcase.quote_currency,
              status: showcase.quote_status,
            }
          : null,
        appointment: appointment.rows[0]
          ? {
              title: appointment.rows[0].title,
              type: appointment.rows[0].appointment_type,
              status: appointment.rows[0].status,
              startsAt: appointment.rows[0].starts_at,
              location: appointment.rows[0].location,
            }
          : null,
        stats: {
          conversations: Number(stats.rows[0]?.conversations ?? 0),
          aiReplies: Number(stats.rows[0]?.ai_replies ?? 0),
          quotes: Number(stats.rows[0]?.quotes ?? 0),
          quoteValue: Number(stats.rows[0]?.quote_value ?? 0),
          appointments: Number(stats.rows[0]?.appointments ?? 0),
          averageLeadScore: Number(stats.rows[0]?.lead_score ?? 0),
        },
        services: products.rows.map((p) => ({
          name: p.name,
          price: Number(p.price),
          currency: p.currency,
          unit: p.unit,
        })),
      },
    });
  } catch (error) {
    logger.error('Public demo lookup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'The demo is unavailable right now.' });
  }
});
