import { query } from '../utils/database';
import logger from '../utils/logger';
import { BadRequestError } from '../utils/errors';
import { getSettingByKey, upsertSetting } from './settings.service';
import { odooAdapter, DEFAULT_ODOO_TIMEOUT_MS } from './integrations/odoo.service';
import {
  CrmAdapter,
  CrmProvider,
  OdooConfig,
} from './integrations/crm.types';

/**
 * CRM integration orchestration.
 *
 * Responsibilities:
 *  - Resolve per-tenant CRM settings (provider + credentials) from `settings`.
 *  - Pick the right adapter (Odoo today; others are drop-ins).
 *  - Keep external-record ids in `crm_record_map` for idempotent re-syncs.
 *  - Never throw into the calling request flow — sync is best-effort and
 *    failures are logged. (The caller in leadScore/quote services invokes
 *    these without awaiting, so a bad CRM config can't break a sale.)
 */

const SETTING_KEYS = {
  provider: 'crm_provider',
  enabled: 'crm_sync_enabled',
  odooUrl: 'odoo_url',
  odooDb: 'odoo_db',
  odooApiKey: 'odoo_api_key',
} as const;

const ADAPTERS: Record<CrmProvider, CrmAdapter> = {
  odoo: odooAdapter,
};

export interface CrmSettingsView {
  provider: CrmProvider | 'none';
  enabled: boolean;
  /** Whether the selected provider has the minimum credentials stored. */
  configured: boolean;
  odoo: { url: string; database: string; hasApiKey: boolean };
}

/** Read a per-tenant setting value, tolerating a missing key. */
async function readSetting(tenantId: string, key: string): Promise<string> {
  try {
    const setting = await getSettingByKey(key, tenantId);
    return setting.setting_value || '';
  } catch {
    return '';
  }
}

async function resolveAdapter(
  tenantId: string
): Promise<{ adapter: CrmAdapter; config: OdooConfig } | null> {
  const provider = (await readSetting(tenantId, SETTING_KEYS.provider)).toLowerCase();
  if (provider !== 'odoo') return null;

  const [url, database, apiKey] = await Promise.all([
    readSetting(tenantId, SETTING_KEYS.odooUrl),
    readSetting(tenantId, SETTING_KEYS.odooDb),
    readSetting(tenantId, SETTING_KEYS.odooApiKey),
  ]);

  if (!url || !apiKey) {
    logger.warn('CRM sync skipped: Odoo credentials incomplete', { tenantId });
    return null;
  }

  return {
    adapter: ADAPTERS.odoo,
    config: { url, database, apiKey, timeoutMs: DEFAULT_ODOO_TIMEOUT_MS },
  };
}

async function isSyncEnabled(tenantId: string): Promise<boolean> {
  const value = (await readSetting(tenantId, SETTING_KEYS.enabled)).toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

/** Public view of a tenant's CRM settings (never exposes the raw API key). */
export async function getCrmSettings(tenantId: string): Promise<CrmSettingsView> {
  const [provider, enabled, url, database, apiKey] = await Promise.all([
    readSetting(tenantId, SETTING_KEYS.provider),
    readSetting(tenantId, SETTING_KEYS.enabled),
    readSetting(tenantId, SETTING_KEYS.odooUrl),
    readSetting(tenantId, SETTING_KEYS.odooDb),
    readSetting(tenantId, SETTING_KEYS.odooApiKey),
  ]);

  const normalizedProvider = (provider || 'none').toLowerCase();
  return {
    provider: (normalizedProvider === 'odoo' ? 'odoo' : 'none') as CrmSettingsView['provider'],
    enabled: enabled === 'true' || enabled === '1' || enabled === 'yes',
    configured: normalizedProvider === 'odoo' && Boolean(url && apiKey),
    odoo: { url, database, hasApiKey: Boolean(apiKey) },
  };
}

export interface SaveCrmSettingsInput {
  provider: CrmProvider | 'none';
  enabled: boolean;
  odoo: { url: string; database: string; apiKey?: string };
}

/**
 * Persist a tenant's CRM settings. The API key is only written when a non-empty
 * value is supplied, so saving the form without re-typing the key does not wipe
 * the stored credential.
 */
export async function saveCrmSettings(tenantId: string, input: SaveCrmSettingsInput): Promise<CrmSettingsView> {
  if (input.provider !== 'none' && input.provider !== 'odoo') {
    throw new BadRequestError("provider must be 'odoo' or 'none'");
  }

  await upsertSetting(SETTING_KEYS.provider, input.provider, tenantId, {
    dataType: 'string',
    description: 'CRM integration provider (odoo | none)',
  });
  await upsertSetting(SETTING_KEYS.enabled, input.enabled ? 'true' : 'false', tenantId, {
    dataType: 'boolean',
    description: 'Enable automatic CRM sync',
  });

  await upsertSetting(SETTING_KEYS.odooUrl, input.odoo.url.trim(), tenantId, {
    dataType: 'string',
    description: 'Odoo base URL (e.g. https://odoo.example.com)',
  });
  await upsertSetting(SETTING_KEYS.odooDb, input.odoo.database.trim(), tenantId, {
    dataType: 'string',
    description: 'Odoo database name (X-Odoo-Database header)',
  });
  if (input.odoo.apiKey && input.odoo.apiKey.trim()) {
    await upsertSetting(SETTING_KEYS.odooApiKey, input.odoo.apiKey.trim(), tenantId, {
      dataType: 'string',
      description: 'Odoo API key (Bearer token)',
    });
  }

  return getCrmSettings(tenantId);
}

/** Test the tenant's stored Odoo connection. */
export async function testCrmConnection(tenantId: string): Promise<{ success: boolean; message: string }> {
  const resolved = await resolveAdapter(tenantId);
  if (!resolved) {
    return { success: false, message: 'Odoo is not configured (set provider=odoo, url and API key)' };
  }
  return resolved.adapter.testConnection(resolved.config);
}

// ---------------------------------------------------------------------------
// Idempotency map helpers
// ---------------------------------------------------------------------------

async function getMappedExternalId(
  tenantId: string,
  entityType: string,
  entityId: string,
  provider: CrmProvider
): Promise<string | null> {
  const result = await query<{ external_id: string }>(
    `SELECT external_id FROM crm_record_map
      WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3 AND provider = $4
      LIMIT 1`,
    [tenantId, entityType, entityId, provider]
  );
  return result.rows[0]?.external_id ?? null;
}

async function saveMapping(
  tenantId: string,
  entityType: string,
  entityId: string,
  provider: CrmProvider,
  externalId: string,
  externalModel: string
): Promise<void> {
  await query(
    `INSERT INTO crm_record_map
       (business_id, entity_type, entity_id, provider, external_id, external_model, synced_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (business_id, entity_type, entity_id, provider)
     DO UPDATE SET external_id = EXCLUDED.external_id,
                   external_model = EXCLUDED.external_model,
                   synced_at = NOW(),
                   updated_at = NOW()`,
    [tenantId, entityType, entityId, provider, externalId, externalModel]
  );
}

// ---------------------------------------------------------------------------
// High-level sync (best-effort; never throws)
// ---------------------------------------------------------------------------

interface ContactRow {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
}

async function loadContact(tenantId: string, contactId: string): Promise<ContactRow | null> {
  const result = await query<ContactRow>(
    `SELECT id, display_name, email, phone, company
       FROM contacts
      WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [contactId, tenantId]
  );
  return result.rows[0] ?? null;
}

/**
 * Sync a contact + lead to the tenant's CRM. Idempotent: re-syncing updates the
 * existing external records rather than creating duplicates. Called fire-and-
 * forget from leadScore.service when a lead becomes qualified/converted.
 */
export async function syncLeadToCrm(params: {
  tenantId: string;
  contactId: string;
  /** Free-text context appended to the lead description. */
  note?: string;
  /** Numeric score used as the lead's expected revenue hint (optional). */
  estimatedRevenue?: number | null;
}): Promise<void> {
  try {
    if (!(await isSyncEnabled(params.tenantId))) return;
    const resolved = await resolveAdapter(params.tenantId);
    if (!resolved) return;
    const { adapter, config } = resolved;

    const contact = await loadContact(params.tenantId, params.contactId);
    if (!contact) {
      logger.warn('CRM lead sync skipped: contact not found', { tenantId: params.tenantId, contactId: params.contactId });
      return;
    }

    const contactName = contact.display_name || contact.phone || 'WhatsApp Contact';
    const partnerExternalId = await getMappedExternalId(params.tenantId, 'contact', contact.id, adapter.provider);
    const partner = await adapter.upsertContact(config, {
      externalId: partnerExternalId || undefined,
      name: contactName,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
    });
    await saveMapping(params.tenantId, 'contact', contact.id, adapter.provider, partner.externalId, 'res.partner');

    const leadExternalId = await getMappedExternalId(params.tenantId, 'lead', contact.id, adapter.provider);
    const lead = await adapter.upsertLead(config, {
      externalId: leadExternalId || undefined,
      partnerId: partner.externalId,
      name: `WhatsApp Lead — ${contactName}`,
      contactName,
      email: contact.email,
      phone: contact.phone,
      description: params.note || undefined,
      expectedRevenue: params.estimatedRevenue ?? null,
    });
    await saveMapping(params.tenantId, 'lead', contact.id, adapter.provider, lead.externalId, 'crm.lead');

    if (params.note) {
      await adapter.logActivity(config, {
        model: 'crm.lead',
        externalId: lead.externalId,
        summary: 'WhatsApp Sales Assistant',
        note: params.note,
      }).catch((err) => logger.warn('CRM activity log failed', { tenantId: params.tenantId, error: toStr(err) }));
    }

    logger.info('CRM lead synced', { tenantId: params.tenantId, contactId: contact.id, provider: adapter.provider, externalId: lead.externalId });
  } catch (error) {
    logger.error('CRM lead sync failed', { tenantId: params.tenantId, contactId: params.contactId, error: toStr(error) });
  }
}

interface QuoteRow {
  id: string;
  quote_number: string;
  total: string | number;
  currency: string;
  notes: string | null;
  contact_id: string;
}

interface QuoteItemRow {
  description: string | null;
  quantity: string | number;
  unit_price: string | number;
}

/**
 * Sync an accepted quote (as a sale.order) to the tenant's CRM. Idempotent via
 * the contact + quote mappings. Called fire-and-forget when a quote is accepted.
 */
export async function syncQuoteToCrm(params: {
  tenantId: string;
  quoteId: string;
}): Promise<void> {
  try {
    if (!(await isSyncEnabled(params.tenantId))) return;
    const resolved = await resolveAdapter(params.tenantId);
    if (!resolved) return;
    const { adapter, config } = resolved;

    const quoteResult = await query<QuoteRow>(
      `SELECT id, quote_number, total, currency, notes, contact_id
         FROM quotes
        WHERE id = $1 AND business_id = $2
        LIMIT 1`,
      [params.quoteId, params.tenantId]
    );
    const quote = quoteResult.rows[0];
    if (!quote) {
      logger.warn('CRM quote sync skipped: quote not found', { tenantId: params.tenantId, quoteId: params.quoteId });
      return;
    }

    const itemsResult = await query<QuoteItemRow>(
      `SELECT description, quantity, unit_price
         FROM quote_items
        WHERE quote_id = $1
        ORDER BY line_number ASC`,
      [quote.id]
    );

    const contact = await loadContact(params.tenantId, quote.contact_id);
    if (!contact) {
      logger.warn('CRM quote sync skipped: contact not found', { tenantId: params.tenantId, contactId: quote.contact_id });
      return;
    }

    const contactName = contact.display_name || contact.phone || 'WhatsApp Contact';
    const partnerExternalId = await getMappedExternalId(params.tenantId, 'contact', contact.id, adapter.provider);
    const partner = await adapter.upsertContact(config, {
      externalId: partnerExternalId || undefined,
      name: contactName,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
    });
    await saveMapping(params.tenantId, 'contact', contact.id, adapter.provider, partner.externalId, 'res.partner');

    const quoteExternalId = await getMappedExternalId(params.tenantId, 'quote', quote.id, adapter.provider);
    const order = await adapter.pushQuote(config, {
      externalId: quoteExternalId || undefined,
      partnerId: partner.externalId,
      reference: quote.quote_number,
      currency: quote.currency,
      total: Number(quote.total),
      notes: quote.notes,
      lines: itemsResult.rows.map((item) => ({
        name: item.description || 'Item',
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        description: item.description,
      })),
    });
    await saveMapping(params.tenantId, 'quote', quote.id, adapter.provider, order.externalId, 'sale.order');

    logger.info('CRM quote synced', { tenantId: params.tenantId, quoteId: quote.id, provider: adapter.provider, externalId: order.externalId });
  } catch (error) {
    logger.error('CRM quote sync failed', { tenantId: params.tenantId, quoteId: params.quoteId, error: toStr(error) });
  }
}

function toStr(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}



