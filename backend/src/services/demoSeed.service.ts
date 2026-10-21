import { query } from '../utils/database';
import logger from '../utils/logger';
import { createBusiness } from './business.service';
import { createTrial } from './subscription.service';
import { hashPassword } from './auth.service';
import { generateEmbeddingsBatch, formatEmbeddingForPgVector, EMBEDDING_MODEL } from './embedding';
import { chunkText } from './chunker';
import {
  AI_PROMPT,
  BUSINESS,
  CONTACTS,
  DEMO_SLUG,
  OTHER_THREADS,
  PRODUCTS,
  PRIYA_THREAD,
  SOURCE_SLUG,
} from './demoSeed.data';

/**
 * Creates the demo tenant: a fictional Jamaican roofing business with a full
 * set of records, so the marketing site and the public demo show the product
 * working with real data rather than a drawing.
 *
 * The seed is idempotent: running it again replaces the demo tenant and its
 * records with a freshly generated set.
 */

export type DemoSeedResult = {
  businessId: string;
  adminEmail: string;
  adminPassword: string;
  products: number;
  contacts: number;
  messages: number;
  knowledgeChunks: number;
};

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

/** Where each demo enquiry ended up. */
const LEAD_STAGE: Record<string, string> = {
  priya: 'appointment_requested',
  michael: 'qualified',
  denise: 'qualified',
  andre: 'new',
};

/**
 * How many days ago each conversation started. The dashboard charts
 * conversation activity over 30 days, so a demo where every conversation
 * started today renders as a single flat point.
 */
const STARTED_DAYS_AGO: Record<string, number> = {
  priya: 0,
  michael: 8,
  denise: 5,
  andre: 2,
};

/** Removes a previous demo tenant and everything that cascades from it. */
export async function removeDemoTenant(): Promise<void> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM businesses WHERE slug = $1 OR metadata->>'is_demo' = 'true'`,
    [DEMO_SLUG]
  );
  const ids = existing.rows.map((row) => row.id);

  // staff_users.business_id is ON DELETE SET NULL, so deleting the business
  // orphans its staff rows rather than removing them, and their unique email
  // constraint then blocks the next insert. Remove them by email as well as
  // by business id, so a partially seeded run cannot block the next one.
  await query(
    `DELETE FROM staff_users
      WHERE (business_id = ANY($1::uuid[]))
         OR email LIKE '%@waflo.demo'`,
    [ids]
  );

  // Everything else the demo owns cascades from the business.
  for (const id of ids) {
    await query(`DELETE FROM businesses WHERE id = $1`, [id]);
    logger.info('Removed previous demo tenant', { businessId: id });
  }
}

export async function seedDemoTenant(options?: {
  adminEmail?: string;
  adminPassword?: string;
  regenerate?: boolean;
}): Promise<DemoSeedResult> {
  const adminEmail = options?.adminEmail || 'demo.admin@waflo.demo';
  const adminPassword = options?.adminPassword || process.env.DEMO_ADMIN_PASSWORD || 'Demo1234!';

  await removeDemoTenant();

  const business = await createBusiness({
    name: BUSINESS.name,
    slug: BUSINESS.slug,
    description: BUSINESS.description,
    email: BUSINESS.email,
    phone: BUSINESS.phone,
    website: BUSINESS.website,
    address: BUSINESS.address,
    currency: BUSINESS.currency,
    timezone: BUSINESS.timezone,
    whatsapp_phone: BUSINESS.whatsapp_phone,
    waha_session_name: BUSINESS.waha_session_name,
    status: 'active',
  });

  const businessId = business.id;

  // Mark the tenant so the public demo surface can find it, and so nothing
  // else mistakes it for a real customer.
  //
  // demo_agent_live stays false until an operator pairs a real WhatsApp
  // number to this tenant. Until then the public demo never publishes a
  // number, so a visitor cannot be sent a message to a stranger's phone.
  await query(
    `UPDATE businesses
        SET metadata = metadata || $2::jsonb
      WHERE id = $1`,
    [
      businessId,
      JSON.stringify({
        is_demo: true,
        public_demo: true,
        sector: 'roofing',
        country: 'JM',
        demo_agent_live: false,
      }),
    ]
  );

  await createTrial(businessId, 'professional');

  // --- settings -------------------------------------------------------
  // data_type is constrained to string | integer | decimal | boolean | json.
  const settings: { key: string; value: string; type: string; description: string }[] = [
    { key: 'currency', value: 'JMD', type: 'string', description: 'Currency for quotes and pipeline values' },
    { key: 'timezone', value: 'America/Jamaica', type: 'string', description: 'Timezone for appointments and timestamps' },
    { key: 'ai_model', value: 'qwen/qwen3.8-27b', type: 'string', description: 'Default chat model' },
    { key: 'ai_prompt', value: AI_PROMPT, type: 'string', description: 'Custom instructions for the agent' },
    { key: 'whatsapp_api_version', value: 'v18.0', type: 'string', description: 'WhatsApp API version' },
    { key: 'message_limit', value: '1000', type: 'integer', description: 'Max WhatsApp messages per 24 hours' },
    { key: 'webhook_url', value: 'https://waflo.vercel.app/api/webhooks/waha', type: 'string', description: 'Webhook URL' },
    { key: 'crm_provider', value: 'none', type: 'string', description: 'CRM provider to sync with' },
    { key: 'crm_sync_enabled', value: 'false', type: 'boolean', description: 'Whether CRM sync runs automatically' },
  ];
  for (const setting of settings) {
    await query(
      `INSERT INTO settings (setting_key, setting_value, data_type, description, business_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (business_id, setting_key) DO UPDATE
         SET setting_value = EXCLUDED.setting_value,
             description = EXCLUDED.description`,
      [setting.key, setting.value, setting.type, setting.description, businessId]
    );
  }

  // --- staff ----------------------------------------------------------
  const passwordHash = await hashPassword(adminPassword);
  const owner = await query<{ id: string }>(
    `INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, phone, password_hash, business_id)
     VALUES ($1,$2,$3,$4,'admin','active',$5,$6,$7,$8)
     RETURNING id`,
    [
      'ROL-DEMO-001',
      'Marcus',
      'Reid',
      adminEmail,
      BUSINESS.timezone,
      '+18765550101',
      passwordHash,
      businessId,
    ]
  );
  const ownerId = owner.rows[0]!.id;

  // No ON CONFLICT clause: staff_users has no unique index on
  // employee_number, and the previous demo tenant was deleted at the start of
  // this run, so there is nothing to conflict with.
  await query(
    `INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, phone, password_hash, business_id)
     VALUES ($1,$2,$3,$4,'sales','active',$5,$6,$7,$8)`,
    [
      'ROL-DEMO-002',
      'Sasha',
      'Bell',
      'demo.manager@waflo.demo',
      BUSINESS.timezone,
      '+18765550102',
      passwordHash,
      businessId,
    ]
  );

  // --- products -------------------------------------------------------
  const productIds: Record<string, string> = {};
  for (const [index, product] of PRODUCTS.entries()) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO products (sku, name, description, category, product_type, unit, price, currency, taxable, tax_rate, active, metadata, business_id)
       VALUES ($1,$2,$3,$4,'service',$5,$6,'JMD',TRUE,0,TRUE,$7::jsonb,$8)
       RETURNING id`,
      [
        product.sku,
        product.name,
        product.description,
        product.category,
        product.unit,
        product.price,
        JSON.stringify({
          order: index + 1,
          // No published prices exist, so the price is the one thing the
          // assistant must never make up.
          pricedAfterDiscovery: true,
        }),
        businessId,
      ]
    );
    productIds[product.sku] = inserted.rows[0]!.id;
  }

  // --- contacts and conversations -------------------------------------
  const contactIds: Record<string, string> = {};
  const conversationIds: Record<string, string> = {};

  for (const contact of CONTACTS) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO contacts (phone, display_name, company, source, preferred_language, opt_in, tags, notes, status, first_seen_at, last_seen_at, business_id)
       VALUES ($1,$2,$3,'whatsapp','en',TRUE,$4::jsonb,$5,'active',NOW(),NOW(),$6)
       RETURNING id`,
      [
        contact.phone,
        contact.display_name,
        contact.company,
        JSON.stringify(contact.tags),
        contact.notes,
        businessId,
      ]
    );
    contactIds[contact.key] = inserted.rows[0]!.id;

    const startedAt = new Date(Date.now() - (STARTED_DAYS_AGO[contact.key] ?? 0) * 24 * 60 * 60 * 1000);
    // created_at is set explicitly because the dashboard charts conversation
    // activity by DATE(created_at). Left to default it would be NOW() for
    // every conversation, and the 30 day chart would render as a single point.
    const conversation = await query<{ id: string }>(
      `INSERT INTO conversations (contact_id, channel, status, started_at, last_message_at, business_id, lead_stage, created_at, updated_at)
       VALUES ($1,'whatsapp','active',$2,$2,$3,$4,$2,$2)
       RETURNING id`,
      [contactIds[contact.key], startedAt, businessId, LEAD_STAGE[contact.key] || 'new']
    );
    conversationIds[contact.key] = conversation.rows[0]!.id;
  }

  // --- messages -------------------------------------------------------
  let messageCount = 0;
  const insertMessage = async (
    conversationId: string,
    message: { direction: string; sender_type: string; minutes_ago: number; text: string; document?: boolean }
  ): Promise<void> => {
    const createdAt = minutesAgo(message.minutes_ago);
    await query(
      `INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body, metadata, business_id, created_at, updated_at, delivered_at, read_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8,$8,$8)`,
      [
        conversationId,
        message.direction,
        message.sender_type,
        'text',
        message.text,
        JSON.stringify({
          // The seeded showcase thread is marked so the public demo can show
          // it. The demo tenant is a live tenant - its agent keeps working and
          // real traffic accumulates - and the marketing page should show the
          // curated conversation, not whatever has piled up since.
          demo_showcase: true,
          ...(message.document
            ? { document: true, quote_number: 'ROL-2026-0148', file_name: 'ROLINJ-Quote-0148.pdf' }
            : {}),
        }),
        businessId,
        createdAt,
      ]
    );
    await query(
      `UPDATE conversations SET last_message_at = GREATEST(last_message_at, $2) WHERE id = $1`,
      [conversationId, createdAt]
    );
    messageCount += 1;
  };

  for (const message of PRIYA_THREAD) {
    await insertMessage(conversationIds.priya!, message);
  }
  for (const [key, thread] of Object.entries(OTHER_THREADS)) {
    for (const message of thread) {
      await insertMessage(conversationIds[key]!, message);
    }
  }

  // --- lead scores ----------------------------------------------------
  await query(
    `INSERT INTO lead_scores
       (contact_id, conversation_id, budget_score, urgency_score, project_type_score,
        location_score, engagement_score, total_score, status, project_type,
        estimated_budget, preferred_timeline, project_location, score_reasoning,
        last_calculated_at, business_id)
     VALUES ($1,$2,70,85,90,95,90,84,'qualified','Accounting & Invoicing',
             'Not stated','This week','Portmore, Jamaica',$3::jsonb,NOW(),$4)`,
    [
      contactIds.priya,
      conversationIds.priya,
      JSON.stringify({
        summary:
          'Pharmacy owner in Portmore asking to replace manual invoicing and payment chasing. Clear operational pain, confirmed a consultation within the hour, and is inside our service area.',
        factors: {
          budget: 'Not stated, so this has to be worked out in discovery rather than assumed.',
          urgency: 'Described the cost as a full day every month - a recurring, felt problem.',
          projectType: 'Invoice generation and payment reminders - our Accounting & Invoicing service.',
          location: 'Portmore - Jamaica, our core market.',
          engagement: 'Replied within 14 minutes and accepted the consultation slot.',
        },
      }),
      businessId,
    ]
  );

  for (const [key, scores] of Object.entries({
    michael: { budget: 60, urgency: 75, project: 85, location: 95, engagement: 80, total: 78, status: 'qualified', type: 'CRM & Sales Automation' },
    denise: { budget: 60, urgency: 70, project: 80, location: 90, engagement: 75, total: 74, status: 'qualified', type: 'Operations Workflows' },
    andre: { budget: 50, urgency: 45, project: 75, location: 90, engagement: 70, total: 65, status: 'new', type: 'Dashboards & Reporting' },
  })) {
    await query(
      `INSERT INTO lead_scores
         (contact_id, conversation_id, budget_score, urgency_score, project_type_score,
          location_score, engagement_score, total_score, status, project_type,
          score_reasoning, last_calculated_at, business_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW(),$12)`,
      [
        contactIds[key],
        conversationIds[key],
        scores.budget,
        scores.urgency,
        scores.project,
        scores.location,
        scores.engagement,
        scores.total,
        scores.status,
        scores.type,
        JSON.stringify({ summary: `Scored from the ${scores.type.toLowerCase()} enquiry.` }),
        businessId,
      ]
    );
  }

  // --- quotes ----------------------------------------------------------
  // ROLINJ.IO publishes no prices, and its knowledge profile forbids the
  // assistant making one up. The quotes are therefore real documents with a
  // real scope and a zero figure: the price follows the written proposal
  // after discovery. Nothing here claims a price ROLINJ.IO does not have.
  const quote = await query<{ id: string }>(
    `INSERT INTO quotes
       (quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total,
        currency, notes, valid_until, created_by, business_id, sent_at, sent_via, metadata)
     VALUES ('ROL-2026-0148',$1,$2,'sent',0,0,0,0,'JMD',
             'CRM and sales automation: lead capture across channels, pipeline visibility, automated follow-up, WhatsApp and email notifications, and Odoo CRM integration. Scope, deliverables, timeline and payment milestones are set in the written proposal after discovery.',
             (CURRENT_DATE + 30),$3,$4,NOW(),'whatsapp',$5::jsonb)
     RETURNING id`,
    [
      contactIds.michael,
      conversationIds.michael,
      ownerId,
      businessId,
      JSON.stringify({ document: true, file_name: 'ROLINJ-Quote-0148.pdf', pricedAfterDiscovery: true }),
    ]
  );

  await query(
    `INSERT INTO quote_items (quote_id, product_id, line_number, description, quantity, unit, unit_price, tax_rate, discount, line_total, metadata, business_id)
     VALUES ($1,$2,1,$3,1,'engagement',0,0,0,0,$4::jsonb,$5)`,
    [
      quote.rows[0]!.id,
      productIds['ROLINJ-PRO'],
      'CRM & Sales Automation - priced after discovery',
      JSON.stringify({ pricedAfterDiscovery: true }),
      businessId,
    ]
  );

  // A second, won engagement. Without it the pipeline shows a 0% conversion
  // rate and the dashboard looks like nothing has ever closed.
  const wonQuote = await query<{ id: string }>(
    `INSERT INTO quotes
       (quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total,
        currency, notes, valid_until, created_by, business_id, sent_at, sent_via, metadata)
     VALUES ('ROL-2026-0119',$1,$2,'accepted',0,0,0,0,'JMD',
             'Dashboards and reporting: revenue trends, customer activity tracking, team performance metrics, and automated daily or weekly reports. Figure confirmed in the signed proposal.',
             (CURRENT_DATE + 30),$3,$4,NOW(),'whatsapp',$5::jsonb)
     RETURNING id`,
    [
      contactIds.andre,
      conversationIds.andre,
      ownerId,
      businessId,
      JSON.stringify({ document: true, file_name: 'ROLINJ-Quote-0119.pdf', pricedAfterDiscovery: true }),
    ]
  );

  await query(
    `INSERT INTO quote_items (quote_id, product_id, line_number, description, quantity, unit, unit_price, tax_rate, discount, line_total, metadata, business_id)
     VALUES ($1,$2,1,$3,1,'engagement',0,0,0,0,$4::jsonb,$5)`,
    [
      wonQuote.rows[0]!.id,
      productIds['ROLINJ-SUITE'],
      'Dashboards & Reporting - priced after discovery',
      JSON.stringify({ pricedAfterDiscovery: true }),
      businessId,
    ]
  );

  // --- appointments ----------------------------------------------------
  // The consultation booked in the showcase conversation.
  const consultation = nextWeekdayAt(11, BUSINESS.timezone);
  const consultationEnd = new Date(consultation.getTime() + 45 * 60 * 1000);

  await query(
    `INSERT INTO appointments
       (contact_id, conversation_id, quote_id, appointment_type, status, title, description,
        location, starts_at, ends_at, assigned_to, reminder_sent, metadata, business_id)
     VALUES ($1,$2,$3,'consultation','confirmed','Free consultation - pharmacy invoicing automation',
             'Discovery call to map the current invoicing and payment chasing process, then a workflow review and a written automation roadmap.',
             'Portmore, Jamaica (video call)',$4,$5,$6,FALSE,'{}'::jsonb,$7)`,
    [contactIds.priya, conversationIds.priya, null, consultation, consultationEnd, ownerId, businessId]
  );

  await query(
    `INSERT INTO appointments
       (contact_id, conversation_id, appointment_type, status, title, description,
        location, starts_at, ends_at, assigned_to, reminder_sent, metadata, business_id)
     VALUES ($1,$2,'consultation','completed','Free consultation - CRM and sales automation',
             'Discovery call and workflow review for lead capture and follow-up.',
             'Video call',$3,$4,$5,TRUE,'{}'::jsonb,$6)`,
    [
      contactIds.michael,
      conversationIds.michael,
      new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
      ownerId,
      businessId,
    ]
  );

  await query(
    `INSERT INTO appointments
       (contact_id, conversation_id, appointment_type, status, title, description,
        location, starts_at, ends_at, assigned_to, reminder_sent, metadata, business_id)
     VALUES ($1,$2,'consultation','scheduled','Free consultation - onboarding workflows',
             'Discovery call for HR onboarding automation.',
             'Video call',$3,$4,$5,FALSE,'{}'::jsonb,$6)`,
    [
      contactIds.denise,
      conversationIds.denise,
      nextWeekdayAt(14, BUSINESS.timezone),
      new Date(nextWeekdayAt(14, BUSINESS.timezone).getTime() + 45 * 60 * 1000),
      ownerId,
      businessId,
    ]
  );

  // --- knowledge base -------------------------------------------------
  // Copied from the live ROLINJ.IO tenant, embeddings and all, so the demo
  // answers exactly what the agent a visitor can message will answer. The
  // copy is refreshed on every seed, so the two can never drift apart.
  const knowledgeChunks = await copyKnowledgeBase(businessId);

  logger.info('Demo tenant seeded', {
    businessId,
    products: PRODUCTS.length,
    contacts: CONTACTS.length,
    messages: messageCount,
    knowledgeChunks,
  });

  return {
    businessId,
    adminEmail,
    adminPassword,
    products: PRODUCTS.length,
    contacts: CONTACTS.length,
    messages: messageCount,
    knowledgeChunks,
  };
}

/**
 * Copies the source tenant's knowledge base, embeddings included.
 *
 * The demo answers from the same documents the live agent answers from, so a
 * visitor who reads the demo and then messages the number gets the same
 * answers. Re-copied on every seed, so an edit to the real knowledge base
 * reaches the demo without anyone remembering to update it.
 */
async function copyKnowledgeBase(targetBusinessId: string): Promise<number> {
  const source = await query<{ id: string }>(
    'SELECT id FROM businesses WHERE slug = $1 AND deleted_at IS NULL LIMIT 1',
    [SOURCE_SLUG]
  );
  const sourceId = source.rows[0]?.id;
  if (!sourceId) {
    logger.warn('Knowledge base source tenant not found, demo will have no knowledge', {
      source: SOURCE_SLUG,
    });
    return 0;
  }

  const documents = await query<{
    id: string;
    title: string;
    document_type: string;
    source: string | null;
    file_name: string | null;
    mime_type: string | null;
    file_size: number | null;
    language: string | null;
    status: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, title, document_type, source, file_name, mime_type, file_size, language, status, metadata
       FROM knowledge_documents WHERE business_id = $1 ORDER BY title`,
    [sourceId]
  );

  let chunkCount = 0;

  for (const document of documents.rows) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO knowledge_documents
         (title, document_type, source, file_name, mime_type, file_size, language, status, metadata, business_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       RETURNING id`,
      [
        document.title,
        document.document_type,
        document.source,
        document.file_name,
        document.mime_type,
        document.file_size,
        document.language,
        document.status,
        JSON.stringify({ ...(document.metadata || {}), seeded: true, demo: true, copiedFrom: SOURCE_SLUG }),
        targetBusinessId,
      ]
    );
    const newDocumentId = inserted.rows[0]!.id;

    const chunks = await query<{
      chunk_number: number;
      chunk_text: string;
      token_count: number | null;
      embedding_model: string | null;
      metadata: Record<string, unknown>;
      embedding: string;
    }>(
      `SELECT chunk_number, chunk_text, token_count, embedding_model, metadata, embedding::text
         FROM knowledge_chunks WHERE document_id = $1 ORDER BY chunk_number`,
      [document.id]
    );

    for (const chunk of chunks.rows) {
      await query(
        `INSERT INTO knowledge_chunks
           (document_id, chunk_number, chunk_text, token_count, embedding_model, metadata, embedding, business_id)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::vector,$8)`,
        [
          newDocumentId,
          chunk.chunk_number,
          chunk.chunk_text,
          chunk.token_count,
          chunk.embedding_model || EMBEDDING_MODEL,
          JSON.stringify({ ...(chunk.metadata || {}), seeded: true, demo: true }),
          chunk.embedding,
          targetBusinessId,
        ]
      );
      chunkCount += 1;
    }
  }

  logger.info('Copied the knowledge base into the demo tenant', {
    source: SOURCE_SLUG,
    documents: documents.rows.length,
    chunks: chunkCount,
  });

  return chunkCount;
}
function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - instant;
}

/** Converts a wall-clock time in a timezone to the UTC instant it refers to. */
function zonedTimeToUtc(localIso: string, timeZone: string): Date {
  const asUtc = Date.parse(`${localIso}Z`);
  // One pass is enough for whole-hour offsets, two for the rest.
  let instant = asUtc - tzOffsetMs(asUtc, timeZone);
  instant = asUtc - tzOffsetMs(instant, timeZone);
  return new Date(instant);
}

/** The next weekday (Mon-Fri) at the given wall-clock hour in the timezone. */
function nextWeekdayAt(hour: number, timeZone: string): Date {
  const now = new Date();
  for (let offset = 1; offset <= 10; offset++) {
    const day = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(day);
    if (weekday === 'Sat' || weekday === 'Sun') continue;

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false,
    }).formatToParts(day);
    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;
    const localIso = `${map.year}-${map.month}-${map.day}T${String(hour).padStart(2, '0')}:00:00`;
    return zonedTimeToUtc(localIso, timeZone);
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
