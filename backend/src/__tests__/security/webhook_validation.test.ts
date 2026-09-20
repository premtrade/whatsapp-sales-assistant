import { validateWebhookSource, WebhookRequest } from '../../middleware/webhookAuth';
import { Response, NextFunction } from 'express';
import crypto from 'crypto';

interface MockRequest extends Partial<WebhookRequest> {
  headers: Record<string, string | undefined>;
  body: any;
  rawBody?: Buffer;
  webhookSource?: string;
}

const createMockReq = (overrides: Partial<MockRequest> = {}): WebhookRequest => {
  const req: MockRequest = {
    headers: {
      'content-type': 'application/json',
      ...overrides.headers,
    },
    body: overrides.body || {},
    rawBody: overrides.rawBody,
    ...overrides,
  };
  return req as WebhookRequest;
};

const createMockRes = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const createMockNext = (): NextFunction => jest.fn();

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

  // The middleware is synchronous: it calls next() on success and THROWS
  // (BadRequestError / UnauthorizedError) on failure. Express 4 converts sync
  // throws into next(err) at the router level, so throwing here is the
  // correct production behavior being verified.

  describe('Content-Type validation', () => {
    it('rejects non-JSON content type', () => {
      const req = createMockReq({ headers: { 'content-type': 'text/plain' } });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });

      expect(() => middleware(req, res, next)).toThrow('Invalid Content-Type');
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts application/json', () => {
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Timestamp validation', () => {
    it('requires X-Timestamp header', () => {
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });

      expect(() => middleware(req, res, next)).toThrow('Missing X-Timestamp header');
    });

    it('rejects timestamp with >300s skew', () => {
      const oldTimestamp = (Date.now() - 400 * 1000).toString(); // 400 seconds ago
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': oldTimestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });

      expect(() => middleware(req, res, next)).toThrow('expired or out of allowed window');
    });

    it('accepts valid timestamp', () => {
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('HMAC signature validation', () => {
    it('accepts valid HMAC signature with rawBody', () => {
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature-256': signature },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects invalid HMAC signature', () => {
      const badSignature = 'sha256=' + 'a'.repeat(64);
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature-256': badSignature },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });

      expect(() => middleware(req, res, next)).toThrow('Invalid webhook signature');
    });

    it('uses rawBody for HMAC when available', () => {
      // rawBody (original key order) must be used for verification instead of
      // JSON.stringify(req.body), which may have a different key order.
      const differentOrderPayload = { data: { foo: 'bar' }, event: 'test' };
      const sameContentRaw = '{"event":"test","data":{"foo":"bar"}}';
      const signatureFromOriginal = 'sha256=' + crypto.createHmac('sha256', secret).update(sameContentRaw).digest('hex');

      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature-256': signatureFromOriginal },
        body: differentOrderPayload,
        rawBody: Buffer.from(sameContentRaw),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Secret token validation', () => {
    it('accepts valid shared secret', () => {
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects invalid shared secret', () => {
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': 'wrong-secret' },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });

      expect(() => middleware(req, res, next)).toThrow('Invalid webhook authentication secret');
    });
  });

  describe('Missing authentication', () => {
    it('rejects when no signature or secret provided', () => {
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'test', secretEnvVarName: 'WEBHOOK_SECRET' });

      expect(() => middleware(req, res, next)).toThrow('Authentication credentials required');
    });
  });

  describe('Production secret requirement', () => {
    it('rejects in production when secret not configured', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalWahaKey = process.env.WAHA_API_KEY;
      process.env.NODE_ENV = 'production';
      delete process.env.WEBHOOK_SECRET;
      delete process.env.WAHA_API_KEY;

      try {
        const req = createMockReq({
          headers: { 'content-type': 'application/json', 'x-timestamp': timestamp },
          body: payload,
          rawBody: Buffer.from(rawPayload),
        });
        const res = createMockRes();
        const next = createMockNext();

        const middleware = validateWebhookSource({ sourceName: 'test' });

        expect(() => middleware(req, res, next)).toThrow('Webhook configuration error');
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalWahaKey !== undefined) process.env.WAHA_API_KEY = originalWahaKey;
      }
    });
  });

  describe('Source name tracking', () => {
    it('sets req.webhookSource', () => {
      const req = createMockReq({
        headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-webhook-secret': secret },
        body: payload,
        rawBody: Buffer.from(rawPayload),
      });
      const res = createMockRes();
      const next = createMockNext();

      const middleware = validateWebhookSource({ sourceName: 'WAHA', secretEnvVarName: 'WEBHOOK_SECRET' });
      middleware(req, res, next);

      expect(req.webhookSource).toBe('WAHA');
      expect(next).toHaveBeenCalledWith();
    });
  });
});
