/**
 * CRM integration contracts.
 *
 * The backend talks to external CRMs (Odoo today, others later) through the
 * `CrmAdapter` interface. Each adapter translates the normalized inputs below
 * into the provider's native API calls. `crm.service.ts` owns orchestration
 * (per-tenant settings, idempotency mapping, audit) and is provider-agnostic.
 *
 * NOTE: The adapter methods currently take an `OdooConfig` because Odoo is the
 * only implemented provider. When a second provider is added, widen this to a
 * shared `CrmConfig` (or a discriminated union) so adapters stay swappable.
 */

export type CrmProvider = 'odoo';

/** Connection settings for an Odoo instance (JSON-2 API). */
export interface OdooConfig {
  /** Base URL, e.g. https://odoo.example.com (no trailing slash required). */
  url: string;
  /** Database name (sent as the X-Odoo-Database header). */
  database: string;
  /** API key used as a Bearer token (create a dedicated bot user in Odoo). */
  apiKey: string;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
}

/** Normalized contact to upsert into a CRM. */
export interface CrmContactInput {
  /** Known external id when re-syncing an already-mapped record. */
  externalId?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}

/** Normalized lead/opportunity to upsert into a CRM. */
export interface CrmLeadInput {
  externalId?: string;
  /** External id of the related partner/contact (res.partner in Odoo). */
  partnerId: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  expectedRevenue?: number | null;
}

/** A single quote line. */
export interface CrmQuoteLineInput {
  name: string;
  quantity: number;
  unitPrice: number;
  description?: string | null;
}

/** Normalized quote to push into a CRM (sale.order in Odoo). */
export interface CrmQuoteInput {
  externalId?: string;
  /** External id of the related partner/contact. */
  partnerId: string;
  /** Human-readable reference (our quote_number). */
  reference: string;
  currency: string;
  total: number;
  notes?: string | null;
  lines: CrmQuoteLineInput[];
}

/** A note/activity to log against an existing CRM record. */
export interface CrmActivityInput {
  /** External model the id refers to (sale.order, crm.lead, ...). */
  model: string;
  externalId: string;
  summary: string;
  note?: string | null;
}

export interface CrmSyncResult {
  externalId: string;
}

/**
 * A provider adapter. Implementations must be safe to call repeatedly:
 * passing a known `externalId` performs an update rather than a create.
 */
export interface CrmAdapter {
  readonly provider: CrmProvider;
  testConnection(config: OdooConfig): Promise<{ success: boolean; message: string }>;
  upsertContact(config: OdooConfig, input: CrmContactInput): Promise<CrmSyncResult>;
  upsertLead(config: OdooConfig, input: CrmLeadInput): Promise<CrmSyncResult>;
  pushQuote(config: OdooConfig, input: CrmQuoteInput): Promise<CrmSyncResult>;
  logActivity(config: OdooConfig, input: CrmActivityInput): Promise<void>;
}
