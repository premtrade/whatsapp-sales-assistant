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
  KNOWLEDGE_DOCUMENTS,
  OTHER_THREADS,
  PRODUCTS,
  KAREN_THREAD,
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

/** Removes a previous demo tenant and everything that cascades from it. */
export async function removeDemoTenant(): Promise<void> {
  const existing = await query<{ id: string }>('SELECT id FROM businesses WHERE slug = $1', [DEMO_SLUG]);
  for (const business of existing.rows) {
    // knowledge_chunks and messages cascade from the business, but be explicit
    // about the tables that reference rows the business owns.
    await query(`DELETE FROM businesses WHERE id = $1`, [business.id]);
    logger.info('Removed previous demo tenant', { businessId: business.id });
  }
}

export async function seedDemoTenant(options?: {
  adminEmail?: string;
  adminPassword?: string;
  regenerate?: boolean;
}): Promise<DemoSeedResult> {
  const adminEmail = options?.adminEmail || 'demo@harbourpointroofing.demo';
  const adminPassword = options?.adminPassword || 'Demo1234!';

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
  await query(
    `UPDATE businesses
        SET metadata = metadata || $2::jsonb
      WHERE id = $1`,
    [businessId, JSON.stringify({ is_demo: true, public_demo: true, sector: 'roofing', country: 'JM' })]
  );

  await createTrial(businessId, 'professional');

  // --- settings -------------------------------------------------------
  const settings: { key: string; value: string; type: string; description: string }[] = [
    { key: 'currency', value: 'JMD', type: 'string', description: 'Currency for quotes and pipeline values' },
    { key: 'timezone', value: 'America/Jamaica', type: 'string', description: 'Timezone for appointments and timestamps' },
    { key: 'ai_model', value: 'qwen/qwen3.8-27b', type: 'string', description: 'Default chat model' },
    { key: 'ai_prompt', value: AI_PROMPT, type: 'text', description: 'Custom instructions for the agent' },
    { key: 'whatsapp_api_version', value: '2.0', type: 'string', description: 'WhatsApp API version' },
    { key: 'message_limit', value: '1000', type: 'number', description: 'Max WhatsApp messages per 24 hours' },
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
      'HPR-001',
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

  await query(
    `INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, phone, business_id)
     VALUES ($1,$2,$3,$4,'sales','active',$5,$6,$7)
     ON CONFLICT (employee_number) DO NOTHING`,
    ['HPR-002', 'Sasha', 'Bell', 'sasha@harbourpointroofing.demo', BUSINESS.timezone, '+18765550102', businessId]
  );

  // --- products -------------------------------------------------------
  const productIds: Record<string, string> = {};
  for (const product of PRODUCTS) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO products (sku, name, description, category, product_type, unit, price, currency, taxable, tax_rate, active, metadata, business_id)
       VALUES ($1,$2,$3,$4,'service',$5,$6,'JMD',TRUE,0,TRUE,'{}'::jsonb,$7)
       RETURNING id`,
      [product.sku, product.name, product.description, product.category, product.unit, product.price, businessId]
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

    const conversation = await query<{ id: string }>(
      `INSERT INTO conversations (contact_id, channel, status, started_at, last_message_at, business_id, lead_stage)
       VALUES ($1,'whatsapp','active',NOW(),NOW(),$2,'new')
       RETURNING id`,
      [contactIds[contact.key], businessId]
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
        JSON.stringify(
          message.document
            ? { document: true, quote_number: 'HQ-2026-0148', file_name: 'Harbour-Point-Quote-HQ-2026-0148.pdf' }
            : {}
        ),
        businessId,
        createdAt,
      ]
    );
    messageCount += 1;
  };

  for (const message of KAREN_THREAD) {
    await insertMessage(conversationIds.karen!, message);
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
     VALUES ($1,$2,85,80,90,95,85,87,'qualified','Roof Replacement',
             'JMD 250,000','Within 2 weeks','St. Andrew',$3::jsonb,NOW(),$4)`,
    [
      contactIds.karen,
      conversationIds.karen,
      JSON.stringify({
        summary:
          'Homeowner in St. Andrew with a stated budget of JMD 250,000 for a 2,000 sq ft roof replacement. Location is in our service area and they responded quickly to the site visit offer.',
        factors: {
          budget: 'Stated JMD 250,000 against a JMD 245,000 package — affordable.',
          urgency: 'Asked for a quote directly, no urgency language, booking within the week.',
          projectType: '2,000 sq ft roof replacement — our highest-volume package.',
          location: 'St. Andrew — core service area.',
          engagement: 'Replied within 13 minutes and confirmed a site visit.',
        },
      }),
      businessId,
    ]
  );

  for (const [key, scores] of Object.entries({
    devon: { budget: 70, urgency: 75, project: 80, location: 95, engagement: 80, total: 80, status: 'qualified', type: 'Gutter Replacement' },
    marcia: { budget: 65, urgency: 95, project: 85, location: 90, engagement: 75, total: 82, status: 'qualified', type: 'Emergency Leak Repair' },
    trevor: { budget: 55, urgency: 40, project: 70, location: 90, engagement: 65, total: 64, status: 'new', type: 'Inspection' },
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

  // --- quote ----------------------------------------------------------
  const quote = await query<{ id: string }>(
    `INSERT INTO quotes
       (quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total,
        currency, notes, valid_until, created_by, business_id, sent_at, sent_via, metadata)
     VALUES ('HQ-2026-0148',$1,$2,'sent',245000,0,0,245000,'JMD',
             '2,000 sq ft shingle package for St. Andrew. Valid 30 days from issue.',
             (CURRENT_DATE + 30),$3,$4,NOW(),'whatsapp',$5::jsonb)
     RETURNING id`,
    [
      contactIds.karen,
      conversationIds.karen,
      ownerId,
      businessId,
      JSON.stringify({ document: true, file_name: 'Harbour-Point-Quote-HQ-2026-0148.pdf' }),
    ]
  );

  await query(
    `INSERT INTO quote_items (quote_id, product_id, line_number, description, quantity, unit, unit_price, tax_rate, discount, line_total, metadata, business_id)
     VALUES ($1,$2,1,$3,1,'project',245000,0,0,245000,'{}'::jsonb,$4)`,
    [
      quote.rows[0]!.id,
      productIds['HPR-ROOF-2000'],
      'Roof Replacement — 2,000 sq ft shingle package',
      businessId,
    ]
  );

  // --- appointment ----------------------------------------------------
  // Next Thursday at 09:00 in the demo business's timezone.
  const siteVisit = nextWeekdayAt(9, BUSINESS.timezone);
  const siteVisitEnd = new Date(siteVisit.getTime() + 60 * 60 * 1000);

  await query(
    `INSERT INTO appointments
       (contact_id, conversation_id, quote_id, appointment_type, status, title, description,
        location, starts_at, ends_at, assigned_to, reminder_sent, metadata, business_id)
     VALUES ($1,$2,$3,'site_visit','confirmed','Site visit — roof replacement, St. Andrew',
             'Measure the roof and confirm the deck before the replacement is scheduled.',
             'St. Andrew, Kingston',$4,$5,$6,FALSE,'{}'::jsonb,$7)`,
    [contactIds.karen, conversationIds.karen, quote.rows[0]!.id, siteVisit, siteVisitEnd, ownerId, businessId]
  );

  await query(
    `INSERT INTO appointments
       (contact_id, conversation_id, appointment_type, status, title, description,
        location, starts_at, ends_at, assigned_to, reminder_sent, metadata, business_id)
     VALUES ($1,$2,'site_visit','scheduled','Site visit — gutter measurement',
             'Measure the warehouse gutters and confirm downpipe runs.',
             'Bailey Hardware, Portmore',$3,$4,$5,FALSE,'{}'::jsonb,$6)`,
    [
      contactIds.devon,
      conversationIds.devon,
      nextWeekdayAt(11, BUSINESS.timezone),
      new Date(nextWeekdayAt(11, BUSINESS.timezone).getTime() + 45 * 60 * 1000),
      ownerId,
      businessId,
    ]
  );

  // --- knowledge base -------------------------------------------------
  let knowledgeChunks = 0;
  for (const doc of KNOWLEDGE_DOCUMENTS) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO knowledge_documents (title, document_type, source, file_name, mime_type, file_size, language, status, metadata, business_id)
       VALUES ($1,$2,$3,$4,'text/plain',$5,'en','ready',$6::jsonb,$7)
       RETURNING id`,
      [
        doc.title,
        doc.document_type,
        doc.text,
        `${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`,
        Buffer.byteLength(doc.text),
        JSON.stringify({ seeded: true, demo: true }),
        businessId,
      ]
    );
    const documentId = inserted.rows[0]!.id;

    const chunks = chunkText(doc.text);
    const embeddings = await generateEmbeddingsBatch(chunks.map((c) => c.text));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      await query(
        `INSERT INTO knowledge_chunks
           (document_id, chunk_number, chunk_text, token_count, embedding_model, metadata, embedding, business_id)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::vector,$8)`,
        [
          documentId,
          i + 1,
          chunk.text,
          chunk.tokenCount ?? null,
          EMBEDDING_MODEL,
          JSON.stringify({ seeded: true, demo: true }),
          formatEmbeddingForPgVector(embeddings[i]!),
          businessId,
        ]
      );
      knowledgeChunks += 1;
    }
  }

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

/** Offset of a timezone from UTC, in milliseconds, at a given instant. */
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
