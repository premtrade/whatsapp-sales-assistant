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
const EXISTING_DOCS: Array<{ id: string; checksum: string; business_id: string }> = [];

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
    return { rows: [STAFF_ROW] };
  }
  if (text.includes('SELECT id FROM knowledge_documents WHERE checksum')) {
    // Postgres applies whatever WHERE the SQL expresses; the mock mirrors it so a
    // tenant-unscoped duplicate check sees other tenants' documents.
    const checksum = params[0] as string;
    const scoped = text.includes('business_id');
    const rows = EXISTING_DOCS.filter(
      (d) => d.checksum === checksum && (!scoped || d.business_id === params[1])
    );
    return { rows: rows.map((d) => ({ id: d.id })) };
  }
  if (text.includes('INSERT INTO knowledge_documents')) {
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

async function postUpload(content: Buffer, fileName: string): Promise<{ status: number; body: string }> {
  const form = new FormData();
  form.append('file', new File([content], fileName, { type: 'text/plain' }));
  form.append('title', 'Garco Services & Pricing');
  form.append('document_type', 'txt');
  form.append('language', 'en');
  form.append('source', 'manual upload');

  const res = await fetch(`${baseUrl}/api/knowledge/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken()}` },
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
});

describe('POST /api/knowledge/upload', () => {
  it('uploads and indexes a txt document (chunks carry tenant business_id)', async () => {
    const { status, body } = await postUpload(Buffer.from(fixtureContent), 'pricing.txt');
    expect({ status, body }).toEqual({ status: 201, body: expect.any(String) });
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
});
