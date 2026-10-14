import {
  getCrmSettings,
  saveCrmSettings,
  syncLeadToCrm,
  syncQuoteToCrm,
} from '../services/crm.service';
import { query } from '../utils/database';
import { getSettingByKey, upsertSetting } from '../services/settings.service';

jest.mock('../utils/database', () => ({ query: jest.fn() }));
jest.mock('../services/settings.service', () => ({
  getSettingByKey: jest.fn(),
  upsertSetting: jest.fn(),
}));

const mockQuery = query as jest.Mock;
const mockGetSetting = getSettingByKey as jest.Mock;
const mockUpsert = upsertSetting as jest.Mock;

const TENANT = '11111111-1111-1111-1111-111111111111';
const CONTACT = '22222222-2222-2222-2222-222222222222';
const QUOTE = '33333333-3333-3333-3333-333333333333';

/** Configure getSettingByKey to return values from a map. */
function setSettings(map: Record<string, string>) {
  mockGetSetting.mockImplementation(async (key: string) => {
    if (key in map) return { setting_value: map[key] };
    throw new Error('not found');
  });
}

function mockFetchSequence(responses: Array<unknown>): jest.Mock {
  const fn: jest.Mock = jest.fn();
  responses.forEach((body) => {
    fn.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  });
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

const CONTACT_ROW = { id: CONTACT, display_name: 'Jane', email: 'jane@x.com', phone: '+1876', company: null };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCrmSettings', () => {
  it('reports configured when odoo credentials are present', async () => {
    setSettings({
      crm_provider: 'odoo',
      crm_sync_enabled: 'true',
      odoo_url: 'https://odoo.example.com',
      odoo_db: 'mydb',
      odoo_api_key: 'secret',
    });
    const view = await getCrmSettings(TENANT);
    expect(view).toEqual({
      provider: 'odoo',
      enabled: true,
      configured: true,
      odoo: { url: 'https://odoo.example.com', database: 'mydb', hasApiKey: true },
    });
  });

  it('reports not configured when provider is none', async () => {
    setSettings({ crm_provider: 'none', crm_sync_enabled: 'false' });
    const view = await getCrmSettings(TENANT);
    expect(view.provider).toBe('none');
    expect(view.configured).toBe(false);
  });
});

describe('saveCrmSettings', () => {
  it('persists provider/enabled/url/db and skips empty api key', async () => {
    await saveCrmSettings(TENANT, {
      provider: 'odoo',
      enabled: true,
      odoo: { url: 'https://odoo.example.com', database: 'mydb' },
    });
    const keys = mockUpsert.mock.calls.map((c) => c[0]);
    expect(keys).toContain('crm_provider');
    expect(keys).toContain('crm_sync_enabled');
    expect(keys).toContain('odoo_url');
    expect(keys).toContain('odoo_db');
    expect(keys).not.toContain('odoo_api_key');
  });

  it('rejects an unknown provider', async () => {
    await expect(
      saveCrmSettings(TENANT, {
        provider: 'salesforce' as unknown as 'odoo',
        enabled: true,
        odoo: { url: '', database: '' },
      })
    ).rejects.toThrow("provider must be 'odoo' or 'none'");
  });
});

describe('syncLeadToCrm', () => {
  it('does nothing when sync is disabled', async () => {
    setSettings({ crm_provider: 'odoo', crm_sync_enabled: 'false', odoo_url: 'u', odoo_api_key: 'k' });
    await syncLeadToCrm({ tenantId: TENANT, contactId: CONTACT });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does nothing when provider is none', async () => {
    setSettings({ crm_provider: 'none', crm_sync_enabled: 'true' });
    await syncLeadToCrm({ tenantId: TENANT, contactId: CONTACT });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('creates partner + lead and stores mappings (new records)', async () => {
    setSettings({ crm_provider: 'odoo', crm_sync_enabled: 'true', odoo_url: 'https://odoo.example.com', odoo_db: 'db', odoo_api_key: 'k' });

    const fetchMock = mockFetchSequence([[], 42, 55, true]);

    mockQuery
      .mockResolvedValueOnce({ rows: [CONTACT_ROW] }) // loadContact
      .mockResolvedValueOnce({ rows: [] }) // getMappedExternalId contact
      .mockResolvedValueOnce({ rows: [] }) // saveMapping contact
      .mockResolvedValueOnce({ rows: [] }) // getMappedExternalId lead
      .mockResolvedValueOnce({ rows: [] }); // saveMapping lead

    await syncLeadToCrm({ tenantId: TENANT, contactId: CONTACT, note: 'Qualified' });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toContain('/json/2/res.partner/search_read');
    expect(urls[1]).toContain('/json/2/res.partner/create');
    expect(urls[2]).toContain('/json/2/crm.lead/create');
    expect(urls[3]).toContain('/json/2/crm.lead/message_post');
    const mapSaves = mockQuery.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO crm_record_map'));
    expect(mapSaves).toHaveLength(2);
  });

  it('reuses existing external ids when mappings exist (idempotent update)', async () => {
    setSettings({ crm_provider: 'odoo', crm_sync_enabled: 'true', odoo_url: 'https://odoo.example.com', odoo_db: 'db', odoo_api_key: 'k' });

    const fetchMock = mockFetchSequence([true, true]);

    mockQuery
      .mockResolvedValueOnce({ rows: [CONTACT_ROW] }) // loadContact
      .mockResolvedValueOnce({ rows: [{ external_id: '42' }] }) // getMappedExternalId contact
      .mockResolvedValueOnce({ rows: [] }) // saveMapping contact
      .mockResolvedValueOnce({ rows: [{ external_id: '55' }] }) // getMappedExternalId lead
      .mockResolvedValueOnce({ rows: [] }); // saveMapping lead

    await syncLeadToCrm({ tenantId: TENANT, contactId: CONTACT });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toContain('/json/2/res.partner/write');
    expect(urls[1]).toContain('/json/2/crm.lead/write');
  });

  it('swallows errors so the caller never throws', async () => {
    setSettings({ crm_provider: 'odoo', crm_sync_enabled: 'true', odoo_url: 'https://odoo.example.com', odoo_db: 'db', odoo_api_key: 'k' });
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(syncLeadToCrm({ tenantId: TENANT, contactId: CONTACT })).resolves.toBeUndefined();
  });
});

describe('syncQuoteToCrm', () => {
  it('creates sale.order from an accepted quote with its line items', async () => {
    setSettings({ crm_provider: 'odoo', crm_sync_enabled: 'true', odoo_url: 'https://odoo.example.com', odoo_db: 'db', odoo_api_key: 'k' });

    const fetchMock = mockFetchSequence([[], 42, 77]);

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: QUOTE, quote_number: 'Q-1', total: '200.00', currency: 'JMD', notes: null, contact_id: CONTACT }] }) // quote
      .mockResolvedValueOnce({ rows: [{ description: 'Roof', quantity: '2', unit_price: '100.00' }] }) // items
      .mockResolvedValueOnce({ rows: [CONTACT_ROW] }) // contact
      .mockResolvedValueOnce({ rows: [] }) // getMappedExternalId contact
      .mockResolvedValueOnce({ rows: [] }) // saveMapping contact
      .mockResolvedValueOnce({ rows: [] }) // getMappedExternalId quote
      .mockResolvedValueOnce({ rows: [] }); // saveMapping quote

    await syncQuoteToCrm({ tenantId: TENANT, quoteId: QUOTE });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const orderCall = fetchMock.mock.calls[2]!;
    expect(orderCall[0]).toContain('/json/2/sale.order/create');
    const body = JSON.parse((orderCall[1] as RequestInit).body as string);
    expect(body.vals_list[0].client_order_ref).toBe('Q-1');
    expect(body.vals_list[0].order_line).toEqual([[0, 0, { name: 'Roof', product_uom_qty: 2, price_unit: 100 }]]);
  });

  it('does nothing when sync is disabled', async () => {
    setSettings({ crm_provider: 'odoo', crm_sync_enabled: 'false', odoo_url: 'u', odoo_api_key: 'k' });
    await syncQuoteToCrm({ tenantId: TENANT, quoteId: QUOTE });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});


