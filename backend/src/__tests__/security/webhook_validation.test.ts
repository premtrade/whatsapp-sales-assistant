import { validateWebhookSource } from '../../middleware/webhookAuth';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Mock Request/Response
interface MockRequest extends Partial<Request> {
  headers: Record<string, string | undefined>;
  body: any;
  rawBody?: Buffer;
  webhookSource?: string;
}

const createMockReq = (overrides: Partial<MockRequest> = {}): Partial<Request> => {
  const req: MockRequest = {
    headers: {
      'content-type': 'application/json',
      ...overrides.headers,
    },
    body: overrides.body || {},
    rawBody: overrides.rawBody,
    ...overrides,
  };
  return req as Partial<Request>;
};

const createMockRes = () => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const createMockNext = () => jest.fn();

describe('webhookAuth - validateWebhookSource', () => {
  const secret = 'test-secret-key';
  const payload = { event: 'test', data: { foo: 'bar' } };
  const rawPayload = JSON.stringify(payload);
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
  const timestamp = Date.now().toString();

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
  });

  describe('Content-Type validation', () => {
    it('rejects non-JSON content type', async () => {
      const req = createMockReq({ headers: { 'content-type': 'text/plain' } });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Invalid Content-Type');
    });

    it('accepts application/json', async () => {
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': Date.now().toString(), 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Timestamp validation', () => {
    it('requires X-Timestamp header', async () => {
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Missing X-Timestamp header');
    });

    it('rejects timestamp with >300s skew', async () => {
      const oldTimestamp = (Date.now() - 400 * 1000).toString(); // 400 seconds ago
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': oldTimestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('expired or out of allowed window');
    });

    it('accepts valid timestamp', async () => {
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('HMAC signature validation', () => {
    it('accepts valid HMAC signature with rawBody', async () => {
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature-256': signature },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects invalid HMAC signature', async () => {
      const badSignature = 'sha256=' + 'a'.repeat(64);
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature-256': badSignature },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Invalid webhook signature');
    });

    it('uses rawBody for HMAC when available', async () => {
      // Test that rawBody is used instead of JSON.stringify(req.body)
      const differentOrderPayload = { data: { foo: 'bar' }, event: 'test' }; // Different key order
      const sameContentRaw = '{"event":"test","data":{"foo":"bar"}}'; // Original order
      const signatureFromOriginal = 'sha256=' + crypto.createHmac('sha256', secret).update(sameContentRaw).digest('hex');
      
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature-256': signatureFromOriginal },
        body: differentOrderPayload, // Different key order in body
        rawBody: Buffer.from(sameContentRaw) // Original raw body
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      // Should pass because rawBody matches the signature
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Secret token validation', () => {
    it('accepts valid shared secret', async () => {
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects invalid shared secret', async () => {
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': 'wrong-secret' },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Invalid webhook authentication secret');
    });
  });

  describe('Missing authentication', () => {
    it('rejects when no signature or secret provided', async () => {
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Authentication credentials required');
    });
  });

  describe('Production secret requirement', () => {
    it('rejects in production when secret not configured', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.WEBHOOK_SECRET;

      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test' });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('Webhook configuration error');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Source name tracking', () => {
    it('sets req.webhookSource', async () => {
      const req = createMockReq({ 
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload)
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'WAHA', secretEnvVarName: 'WEBHOOK_SECRET' });
      await middleware(req, res, next);

      expect(req.webhookSource).toBe('WAHA');
      expect(next).toHaveBeenCalledWith();
    });
  });
});