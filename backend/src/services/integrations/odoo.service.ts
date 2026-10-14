import {
  CrmAdapter,
  CrmContactInput,
  CrmLeadInput,
  CrmQuoteInput,
  CrmActivityInput,
  CrmSyncResult,
  OdooConfig,
} from './crm.types';

/**
 * Default per-request timeout for Odoo calls.
 */
const DEFAULT_ODOO_TIMEOUT_MS = 15000;

/**
 * Odoo adapter for the External JSON-2 API (Odoo 17/18/19+).
 *
 * Wire format (verified against Odoo's `WebJson2Controller`):
 *   POST {url}/json/2/{model}/{method}
 *   Headers: Authorization: Bearer {apiKey}, X-Odoo-Database: {db}
 *   Body:    a JSON object of NAMED parameters matching the method signature.
 *            `ids` and `context` are special top-level keys; everything else is
 *            passed as keyword arguments.
 *
 *   - create      -> { vals_list: [ {..} ] }         (returns id / [id])
 *   - write       -> { ids: [id], vals: {..} }        (returns true)
 *   - search_read -> { domain: [...], fields: [...], offset, limit }
 *   - message_post-> { ids: [id], body: "..." }
 */
export const odooAdapter: CrmAdapter = {
  provider: 'odoo',

  async testConnection(config: OdooConfig): Promise<{ success: boolean; message: string }> {
    try {
      // res.users/context_get performs an authenticated no-op that returns the
      // caller's uid — a cheap, read-only way to validate url/db/api key.
      const result = await odooCall<{ uid?: number }>(config, 'res.users', 'context_get', {});
      if (result && typeof result === 'object' && typeof result.uid === 'number') {
        return { success: true, message: `Connected to Odoo (uid ${result.uid})` };
      }
      return { success: true, message: 'Connected to Odoo' };
    } catch (error) {
      return { success: false, message: toMessage(error) };
    }
  },

  async upsertContact(config: OdooConfig, input: CrmContactInput): Promise<CrmSyncResult> {
    const vals: Record<string, unknown> = { name: input.name };
    if (input.email) vals.email = input.email;
    if (input.phone) vals.phone = input.phone;
    // `company_name` is the company of an individual person in res.partner.
    if (input.company) vals.company_name = input.company;

    // Update path: we already know the external id (idempotent re-sync).
    if (input.externalId) {
      await odooCall(config, 'res.partner', 'write', {
        ids: [Number(input.externalId)],
        vals,
      });
      return { externalId: input.externalId };
    }

    // First sync: de-duplicate by email then phone before creating.
    const domain: unknown[] = [];
    if (input.email) {
      domain.push(['email', '=', input.email]);
    } else if (input.phone) {
      domain.push(['phone', '=', input.phone]);
    }

    if (domain.length > 0) {
      const found = await odooCall<Array<{ id: number }>>(config, 'res.partner', 'search_read', {
        domain,
        fields: ['id'],
        offset: 0,
        limit: 1,
      });
      const existingId = Array.isArray(found) && found[0] ? found[0].id : undefined;
      if (existingId) {
        await odooCall(config, 'res.partner', 'write', { ids: [existingId], vals });
        return { externalId: String(existingId) };
      }
    }

    const created = await odooCall<number | number[]>(config, 'res.partner', 'create', {
      vals_list: [vals],
    });
    const id = firstId(created);
    if (id === null) throw new Error('Odoo did not return an id after creating res.partner');
    return { externalId: String(id) };
  },

  async upsertLead(config: OdooConfig, input: CrmLeadInput): Promise<CrmSyncResult> {
    const vals: Record<string, unknown> = { name: input.name };
    if (input.partnerId) vals.partner_id = Number(input.partnerId);
    if (input.contactName) vals.contact_name = input.contactName;
    if (input.email) vals.email_from = input.email;
    if (input.phone) vals.phone = input.phone;
    if (input.description) vals.description = input.description;
    if (input.expectedRevenue != null) vals.expected_revenue = input.expectedRevenue;

    if (input.externalId) {
      await odooCall(config, 'crm.lead', 'write', {
        ids: [Number(input.externalId)],
        vals,
      });
      return { externalId: input.externalId };
    }

    const created = await odooCall<number | number[]>(config, 'crm.lead', 'create', {
      vals_list: [vals],
    });
    const id = firstId(created);
    if (id === null) throw new Error('Odoo did not return an id after creating crm.lead');
    return { externalId: String(id) };
  },

  async pushQuote(config: OdooConfig, input: CrmQuoteInput): Promise<CrmSyncResult> {
    const orderLine = input.lines.map((line) => [
      0,
      0,
      {
        name: line.description || line.name,
        product_uom_qty: line.quantity,
        price_unit: line.unitPrice,
      },
    ]);

    const vals: Record<string, unknown> = {
      partner_id: Number(input.partnerId),
      client_order_ref: input.reference,
      order_line: orderLine,
    };
    if (input.notes) vals.note = input.notes;

    if (input.externalId) {
      await odooCall(config, 'sale.order', 'write', {
        ids: [Number(input.externalId)],
        vals,
      });
      return { externalId: input.externalId };
    }

    const created = await odooCall<number | number[]>(config, 'sale.order', 'create', {
      vals_list: [vals],
    });
    const id = firstId(created);
    if (id === null) throw new Error('Odoo did not return an id after creating sale.order');
    return { externalId: String(id) };
  },

  async logActivity(config: OdooConfig, input: CrmActivityInput): Promise<void> {
    const body = input.note
      ? `<p><strong>${escapeHtml(input.summary)}</strong></p><p>${escapeHtml(input.note)}</p>`
      : `<p><strong>${escapeHtml(input.summary)}</strong></p>`;
    // message_post writes to the record's chatter. Best-effort: failures are
    // logged by the caller but must never break the primary sync.
    await odooCall(config, input.model, 'message_post', {
      ids: [Number(input.externalId)],
      body,
    });
  },
};

/**
 * Perform a single JSON-2 call. Each call is its own transaction on the Odoo
 * side (documented behaviour), so callers must not assume atomicity across
 * multiple odooCall() invocations.
 */
async function odooCall<T>(
  config: OdooConfig,
  model: string,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const base = config.url.replace(/\/+$/, '');
  const url = `${base}/json/2/${encodeURIComponent(model)}/${encodeURIComponent(method)}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.database) headers['X-Odoo-Database'] = config.database;

  const timeout = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_ODOO_TIMEOUT_MS;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new Error(`Odoo request to ${model}.${method} failed: ${toMessage(error)}`);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new Error(`Odoo ${model}.${method} failed (HTTP ${res.status}): ${extractOdooError(data)}`);
  }

  return data as T;
}

/** Extract a new record id from Odoo's create response (number or [number]). */
function firstId(value: number | number[] | null | undefined): number | null {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') return value[0];
  return null;
}

/** Best-effort extraction of an Odoo error message from a JSON error body. */
function extractOdooError(data: unknown): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const nested = obj.error as Record<string, unknown> | undefined;
    const message = (nested && (nested.message as string)) || (obj.message as string);
    const name = (nested && (nested.name as string)) || (obj.name as string);
    if (message) return name ? `${name}: ${message}` : message;
  }
  if (typeof data === 'string' && data.trim()) return data.slice(0, 500);
  return 'no error detail returned by Odoo';
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { DEFAULT_ODOO_TIMEOUT_MS };

