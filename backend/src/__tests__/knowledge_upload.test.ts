import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from '../app';

const queryMock = jest.fn();
const generateEmbeddingsBatchMock = jest.fn();

jest.mock('../utils/database', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  getPool: jest.fn(),
  getClient: jest.fn(),
  transaction: jest.fn(),
  closePool: jest.fn(),
}));

jest.mock('../services/embedding', () => ({
  EMBEDDING_MODEL: 'test-embedding-model',
  generateEmbedding: jest.fn(),
  generateEmbeddingsBatch: (...args: unknown[]) => generateEmbeddingsBatchMock(...args),
  formatEmbeddingForPgVector: (e: number[]) => `[${e.join(',')}]`,
  parsePgVectorEmbedding: (v: string) => v.replace(/[\[\]]/g, '').split(',').map(Number),
  cosineSimilarity: () => 0,
}));

jest.mock('../services/subscription.service', () => ({
  getActiveSubscription: jest.fn(async () => ({ id: 'sub-1', business_id: 'biz-1', status: 'active' })),
  assertUsable: jest.fn(),
  requireFeatureLimit: jest.fn(async () => {}),
  trialDaysLeft: jest.fn(() => null),
  isUsable: jest.fn(() => true),
  expireDueTrials: jest.fn(async () => 0),
}));

jest.mock('../services/audit.service', () => ({
  createAuditLog: jest.fn(async () => {}),
}));

const JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

const STAFF_ROW = {
  id: 'user-1',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
  business_id: 'biz-1',
  employee_number: 'E1',
  first_name: 'Admin',
  last_name: 'User',
};

// Documents that already exist (simulates migration 051's NOT NULL constraint on
// knowledge_chunks.business_id and cross-tenant content ownership).
const EXISTING_DOCS: Array<{ id: string; checksum: string; business_id: string; status?: string }> = [];

// Captures params of every knowledge_documents INSERT so tests can assert the
// checksum is actually persisted (the text path dedupes on a checksum it must
// store — a missing checksum column silently defeats duplicate protection).
const DOCUMENT_INSERTS: unknown[][] = [];

// Captures DELETE statements purging prior failed attempts for a checksum.
const FAILED_DOC_DELETES: unknown[][] = [];

let server: ReturnType<typeof createServer>;
let baseUrl: string;
let fixturePath: string;
let fixtureContent: string;

function notNullViolation(column: string, table: string): Error {
  const err = new Error(`null value in column "${column}" of relation "${table}" violates not-null constraint`) as Error & { code?: string };
  err.code = '23502';
  return err;
}

function routeQuery(text: string, params: unknown[]): unknown {
  if (text.includes('FROM staff_users')) {
    // Auth resolves tenant from the DB row, not the token claim; user-2 lives
    // in another tenant so cross-tenant isolation can be exercised.
    const id = params[0] as string;
    return { rows: [{ ...STAFF_ROW, id, business_id: id === 'user-2' ? 'other-biz' : STAFF_ROW.business_id }] };
  }
  if (text.includes('FROM businesses')) {
    return { rows: [{ id: 'biz-1' }] };
  }
  if (text.includes('SELECT id FROM knowledge_documents WHERE checksum')) {
    // Postgres applies whatever WHERE the SQL expresses; the mock mirrors it so a
    // tenant-unscoped duplicate check sees other tenants' documents, and a
    // previous FAILED attempt does not block a retry.
    const checksum = params[0] as string;
    const scoped = text.includes('business_id');
    const rows = EXISTING_DOCS.filter(
      (d) =>
        d.checksum === checksum &&
        (!scoped || d.business_id === params[1]) &&
        (d.status ?? 'indexed') !== 'failed'
    );
    return { rows: rows.map((d) => ({ id: d.id })) };
  }
  if (text.includes('DELETE FROM knowledge_documents WHERE checksum')) {
    // Purges stale failed attempts before re-inserting the same content.
    FAILED_DOC_DELETES.push(params ?? []);
    return { rows: [] };
  }
  if (/FROM knowledge_documents\s+WHERE id/.test(text)) {
    // getKnowledgeDocumentById / reindex lookup (tenant-scoped via business_id).
    const id = params[0] as string;
    const scoped = text.includes('business_id');
    if (id === 'doc-1' && (!scoped || params[1] === 'biz-1')) {
      return { rows: [{ id: 'doc-1', business_id: 'biz-1', title: 'Text Doc', document_type: 'faq', language: 'en', status: 'failed', metadata: {}, created_at: new Date(), updated_at: new Date() }] };
    }
    return { rows: [] };
  }
  if (text.includes('INSERT INTO knowledge_documents')) {
    DOCUMENT_INSERTS.push(params ?? []);
    return { rows: [{ id: 'doc-1', title: 'Uploaded Doc', document_type: 'txt', status: 'processing' }] };
  }
  if (text.includes('INSERT INTO knowledge_chunks')) {
    // Simulates knowledge_chunks.business_id NOT NULL (migration 051).
    if (!text.includes('business_id')) {
      throw notNullViolation('business_id', 'knowledge_chunks');
    }
    return { rows: [] };
  }
  return { rows: [] };
}

function makeToken(): string {
  return jwt.sign(
    { userId: 'user-1', email: 'admin@example.com', role: 'admin', businessId: 'biz-1' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function makeSuperAdminToken(): string {
  return jwt.sign(
    { userId: 'user-owner', email: 'owner@waflo.app', role: 'super_admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function postUpload(content: Buffer, fileName: string, token: string = makeToken(), mimeType: string = 'text/plain'): Promise<{ status: number; body: string }> {
  const form = new FormData();
  form.append('file', new File([content], fileName, { type: mimeType }));
  form.append('title', 'Garco Services & Pricing');
  form.append('language', 'en');
  form.append('source', 'manual upload');

  const res = await fetch(`${baseUrl}/api/knowledge/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.text() };
}

beforeAll(async () => {
  queryMock.mockImplementation(async (text: string, params?: unknown[]) => routeQuery(text, params ?? []));
  generateEmbeddingsBatchMock.mockImplementation(async (texts: string[]) => texts.map(() => new Array(768).fill(0.1)));

  fixtureContent = 'Garco offers roofing, plumbing and electrical services. Contact us for a quote.';
  fixturePath = path.join(__dirname, '__upload_fixture__.txt');
  fs.writeFileSync(fixturePath, fixtureContent);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  fs.unlinkSync(fixturePath);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  EXISTING_DOCS.length = 0;
  DOCUMENT_INSERTS.length = 0;
  FAILED_DOC_DELETES.length = 0;
});

describe('POST /api/knowledge/upload', () => {
  it('uploads and indexes a txt document (chunks carry tenant business_id)', async () => {
    const { status, body } = await postUpload(Buffer.from(fixtureContent), 'pricing.txt');
    expect({ status, body }).toEqual({ status: 201, body: expect.any(String) });
    expect(JSON.parse(body).data.chunksCreated).toBeGreaterThan(0);
  });

  it('allows super_admin to upload document without tenant in JWT (resolves to active business)', async () => {
    const { status, body } = await postUpload(Buffer.from('Roofing warranty details'), 'warranty.txt', makeSuperAdminToken());
    expect(status).toBe(201);
    expect(JSON.parse(body).data.chunksCreated).toBeGreaterThan(0);
  });

  it('does not treat identical content from another tenant as a duplicate', async () => {
    EXISTING_DOCS.push({
      id: 'doc-other',
      checksum: crypto.createHash('sha256').update(Buffer.from(fixtureContent)).digest('hex'),
      business_id: 'other-biz',
    });

    const { status } = await postUpload(Buffer.from(fixtureContent), 'pricing.txt');
    expect(status).toBe(201);
  });

  it('allows re-uploading a file whose previous attempt FAILED (retry succeeds, stale row purged)', async () => {
    EXISTING_DOCS.push({
      id: 'doc-failed',
      checksum: crypto.createHash('sha256').update(Buffer.from(fixtureContent)).digest('hex'),
      business_id: 'biz-1',
      status: 'failed',
    });

    const { status } = await postUpload(Buffer.from(fixtureContent), 'pricing.txt');
    expect(status).toBe(201);
    expect(FAILED_DOC_DELETES).toHaveLength(1);
    expect(FAILED_DOC_DELETES[0]).toContain(crypto.createHash('sha256').update(Buffer.from(fixtureContent)).digest('hex'));
  });
});

describe('POST /api/knowledge (manual text document)', () => {
  async function postCreate(payload: unknown, token: string = makeToken()): Promise<{ status: number; body: string }> {
    const res = await fetch(`${baseUrl}/api/knowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: res.status, body: await res.text() };
  }

  it('creates, chunks and indexes a text document with content', async () => {
    const content = 'All returns must be made within 30 days of purchase with a valid receipt.';
    const { status, body } = await postCreate({
      title: 'Return Policy',
      document_type: 'policy',
      language: 'en',
      content,
    });

    expect(status).toBe(201);
    const parsed = JSON.parse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.document).toBeDefined();
    expect(parsed.data.chunksCreated).toBeGreaterThan(0);
    // Regression guard: the checksum used for dedupe must actually be persisted,
    // otherwise the duplicate check compares against rows it never wrote.
    expect(DOCUMENT_INSERTS).toHaveLength(1);
    expect(DOCUMENT_INSERTS[0]).toContain(crypto.createHash('sha256').update(content).digest('hex'));
  });

  it('rejects a text document whose content already exists for the tenant (409)', async () => {
    const content = 'Doors are warrantied for two years against manufacturing defects.';
    EXISTING_DOCS.push({
      id: 'doc-dup',
      checksum: crypto.createHash('sha256').update(content).digest('hex'),
      business_id: 'biz-1',
    });

    const { status } = await postCreate({ title: 'Warranty', document_type: 'policy', content });
    expect(status).toBe(409);
  });

  it('does not treat identical content from another tenant as a duplicate', async () => {
    const content = 'Free site visits are available within Kingston.';
    EXISTING_DOCS.push({
      id: 'doc-other',
      checksum: crypto.createHash('sha256').update(content).digest('hex'),
      business_id: 'other-biz',
    });

    const { status } = await postCreate({ title: 'Site Visits', document_type: 'faq', content });
    expect(status).toBe(201);
  });

  it('allows re-creating content whose previous attempt FAILED (retry succeeds, stale row purged)', async () => {
    const content = 'Doors are warrantied for two years against manufacturing defects.';
    EXISTING_DOCS.push({
      id: 'doc-failed',
      checksum: crypto.createHash('sha256').update(content).digest('hex'),
      business_id: 'biz-1',
      status: 'failed',
    });

    const { status } = await postCreate({ title: 'Warranty Retry', document_type: 'policy', content });
    expect(status).toBe(201);
    // The stale failed row is purged so it cannot block or duplicate again.
    expect(FAILED_DOC_DELETES).toHaveLength(1);
    expect(FAILED_DOC_DELETES[0]).toContain(crypto.createHash('sha256').update(content).digest('hex'));
  });

  it('creates a metadata-only document when no content is supplied', async () => {
    const { status, body } = await postCreate({ title: 'Catalog Placeholder', document_type: 'other' });

    expect(status).toBe(201);
    const parsed = JSON.parse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.id).toBe('doc-1');
  });

  it('rejects a request missing the required title (400)', async () => {
    const { status } = await postCreate({ document_type: 'faq', content: 'some content' });
    expect(status).toBe(400);
  });

  it('allows super_admin to create a text document without tenant in JWT', async () => {
    const { status, body } = await postCreate(
      { title: 'Owner Policy', document_type: 'policy', content: 'Payment is due on completion.' },
      makeSuperAdminToken()
    );

    expect(status).toBe(201);
    expect(JSON.parse(body).data.chunksCreated).toBeGreaterThan(0);
  });
});

describe('POST /api/knowledge/:id/reindex', () => {
  async function postReindex(id: string, token: string = makeToken()): Promise<{ status: number; body: string }> {
    const res = await fetch(`${baseUrl}/api/knowledge/${id}/reindex`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.text() };
  }

  it('returns a re-upload instruction for an existing document', async () => {
    const { status, body } = await postReindex('doc-1');

    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.requiresReupload).toBe(true);
    expect(parsed.message).toContain('re-upload');
  });

  it('returns 404 for a document belonging to another tenant', async () => {
    // user-2 is a staff user of other-biz in the auth DB lookup.
    const token = jwt.sign(
      { userId: 'user-2', email: 'other@example.com', role: 'admin', businessId: 'other-biz' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const { status } = await postReindex('doc-1', token);
    expect(status).toBe(404);
  });

  it('returns 404 for an unknown document', async () => {
    const { status } = await postReindex('doc-missing');
    expect(status).toBe(404);
  });
});
