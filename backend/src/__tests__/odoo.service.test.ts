import { odooAdapter } from '../services/integrations/odoo.service';
import { OdooConfig } from '../services/integrations/crm.types';

const config: OdooConfig = {
  url: 'https://odoo.example.com',
  database: 'mydb',
  apiKey: 'secret-key',
  timeoutMs: 5000,
};

type FetchCall = { url: string; body: unknown; headers: Record<string, string> };

/** Install a fetch mock that records calls and returns queued responses. */
function mockFetch(responses: Array<{ status?: number; body: unknown }>): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let i = 0;
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: init.body ? JSON.parse(init.body as string) : null,
      headers: (init.headers || {}) as Record<string, string>,
    });
    const res = responses[Math.min(i, responses.length - 1)] ?? { status: 200, body: undefined };
    i += 1;
    const status = res.status ?? 200;
    return {
      ok: status < 400,
      status,
      text: async () => (res.body === undefined ? '' : JSON.stringify(res.body)),
    };
  });
  return { calls };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('odooAdapter.testConnection', () => {
  it('returns success with uid when context_get succeeds', async () => {
    mockFetch([{ body: { uid: 7 } }]);
    const result = await odooAdapter.testConnection(config);
    expect(result.success).toBe(true);
    expect(result.message).toContain('uid 7');
  });

  it('returns failure with message on HTTP error', async () => {
    mockFetch([{ status: 401, body: { name: 'AccessError', message: 'Invalid API key' } }]);
    const result = await odooAdapter.testConnection(config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid API key');
  });
});

describe('odooAdapter.upsertContact', () => {
  it('creates a partner when no externalId and none found', async () => {
    const { calls } = mockFetch([
      { body: [] }, // search_read -> none
      { body: 42 }, // create -> id
    ]);
    const result = await odooAdapter.upsertContact(config, {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+18765551234',
      company: 'Acme',
    });
    expect(result.externalId).toBe('42');
    // search_read first
    expect(calls[0]!.url).toBe('https://odoo.example.com/json/2/res.partner/search_read');
    expect(calls[0]!.body).toMatchObject({ domain: [['email', '=', 'jane@example.com']], limit: 1 });
    // create second, with vals_list wrapping the vals
    expect(calls[1]!.url).toBe('https://odoo.example.com/json/2/res.partner/create');
    expect(calls[1]!.body).toEqual({
      vals_list: [{ name: 'Jane Doe', email: 'jane@example.com', phone: '+18765551234', company_name: 'Acme' }],
    });
  });

  it('reuses an existing partner found by search', async () => {
    const { calls } = mockFetch([
      { body: [{ id: 99 }] }, // search_read -> existing
      { body: true }, // write
    ]);
    const result = await odooAdapter.upsertContact(config, {
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
    expect(result.externalId).toBe('99');
    expect(calls[1]!.url).toBe('https://odoo.example.com/json/2/res.partner/write');
    expect(calls[1]!.body).toMatchObject({ ids: [99] });
  });

  it('updates directly when externalId is provided (idempotent)', async () => {
    const { calls } = mockFetch([{ body: true }]);
    const result = await odooAdapter.upsertContact(config, {
      externalId: '123',
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
    expect(result.externalId).toBe('123');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://odoo.example.com/json/2/res.partner/write');
    expect(calls[0]!.body).toMatchObject({ ids: [123] });
  });
});

describe('odooAdapter request format', () => {
  it('sends Bearer auth and X-Odoo-Database header', async () => {
    const { calls } = mockFetch([{ body: { uid: 1 } }]);
    await odooAdapter.testConnection(config);
    expect(calls[0]!.headers.Authorization).toBe('Bearer secret-key');
    expect(calls[0]!.headers['X-Odoo-Database']).toBe('mydb');
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
  });
});

describe('odooAdapter.upsertLead', () => {
  it('creates a crm.lead linked to the partner', async () => {
    const { calls } = mockFetch([{ body: 55 }]);
    const result = await odooAdapter.upsertLead(config, {
      partnerId: '42',
      name: 'WhatsApp Lead — Jane',
      email: 'jane@example.com',
      description: 'Qualified',
      expectedRevenue: 1000,
    });
    expect(result.externalId).toBe('55');
    expect(calls[0]!.url).toBe('https://odoo.example.com/json/2/crm.lead/create');
    expect(calls[0]!.body).toEqual({
      vals_list: [{
        name: 'WhatsApp Lead — Jane',
        partner_id: 42,
        email_from: 'jane@example.com',
        description: 'Qualified',
        expected_revenue: 1000,
      }],
    });
  });
});

describe('odooAdapter.pushQuote', () => {
  it('creates a sale.order with order_line tuples', async () => {
    const { calls } = mockFetch([{ body: 77 }]);
    const result = await odooAdapter.pushQuote(config, {
      partnerId: '42',
      reference: 'Q-2026-000001',
      currency: 'JMD',
      total: 200,
      lines: [{ name: 'Roofing', quantity: 2, unitPrice: 100, description: 'Roof work' }],
    });
    expect(result.externalId).toBe('77');
    expect(calls[0]!.url).toBe('https://odoo.example.com/json/2/sale.order/create');
    expect(calls[0]!.body).toEqual({
      vals_list: [{
        partner_id: 42,
        client_order_ref: 'Q-2026-000001',
        order_line: [[0, 0, { name: 'Roof work', product_uom_qty: 2, price_unit: 100 }]],
      }],
    });
  });
});
