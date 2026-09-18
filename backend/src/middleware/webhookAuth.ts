import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { UnauthorizedError, BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

export interface WebhookRequest extends Request {
  rawBody?: Buffer;
  webhookSource?: string;
  tenantId?: string;
}

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validates inbound webhook requests by verifying shared secrets or HMAC-SHA256 signatures,
 * rejecting replay attacks, and ensuring proper payload structure.
 */
export function validateWebhookSource(options: {
  secretHeaderName?: string;
  signatureHeaderName?: string;
  timestampHeaderName?: string;
  secretEnvVarName?: string;
  defaultSecret?: string;
  sourceName?: string;
} = {}) {
  const secretHeader = (options.secretHeaderName || 'x-webhook-secret').toLowerCase();
  const signatureHeader = (options.signatureHeaderName || 'x-signature-256').toLowerCase();
  const timestampHeader = (options.timestampHeaderName || 'x-timestamp').toLowerCase();
  const envSecret = options.secretEnvVarName ? process.env[options.secretEnvVarName] : undefined;
  const expectedSecret = envSecret || options.defaultSecret || process.env.WEBHOOK_SECRET || process.env.WAHA_API_KEY || '';
  const sourceName = options.sourceName || 'webhook';

  return (req: WebhookRequest, res: Response, next: NextFunction): void => {
    // 1. Content-Type check
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      throw new BadRequestError('Invalid Content-Type: application/json required');
    }

    // 2. Timestamp / Replay protection - REQUIRED
    const timestampVal = req.headers[timestampHeader] as string | undefined;
    if (!timestampVal) {
      logger.warn(`Rejected webhook from ${sourceName}: missing X-Timestamp header`);
      throw new UnauthorizedError('Missing X-Timestamp header');
    }
    const requestTime = parseInt(timestampVal, 10);
    const now = Date.now();
    // Can be unix timestamp in ms or seconds
    const requestTimeMs = requestTime < 1e11 ? requestTime * 1000 : requestTime;
    if (isNaN(requestTimeMs) || Math.abs(now - requestTimeMs) > MAX_TIMESTAMP_SKEW_MS) {
      logger.warn(`Rejected replayed or expired webhook from ${sourceName}`, {
        timestampVal,
        skewMs: Math.abs(now - requestTimeMs),
      });
      throw new UnauthorizedError('Request timestamp expired or out of allowed window');
    }

    // 3. Authenticity check: either HMAC signature or secret header
    const providedSignature = req.headers[signatureHeader] as string | undefined;
    const providedSecret = req.headers[secretHeader] as string | undefined;

    if (!expectedSecret) {
      // In development or if not configured, warn but require some key
      if (process.env.NODE_ENV === 'production') {
        logger.error(`Webhook secret for ${sourceName} is not configured in production`);
        throw new UnauthorizedError('Webhook configuration error');
      }
    }

    // Use rawBody for HMAC verification (exact payload as received)
    const rawPayload = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    if (providedSignature && expectedSecret) {
      // HMAC SHA-256 validation
      const computedSignature = 'sha256=' + crypto
        .createHmac('sha256', expectedSecret)
        .update(rawPayload)
        .digest('hex');

      const sigBuffer = Buffer.from(providedSignature);
      const compBuffer = Buffer.from(computedSignature);

      if (sigBuffer.length !== compBuffer.length || !crypto.timingSafeEqual(sigBuffer, compBuffer)) {
        logger.warn(`Invalid webhook signature for ${sourceName}`, { ip: req.ip });
        throw new UnauthorizedError('Invalid webhook signature');
      }
    } else if (providedSecret) {
      // Shared secret token comparison (timing-safe)
      const secretBuf = Buffer.from(providedSecret);
      const expectedBuf = Buffer.from(expectedSecret);

      if (
        !expectedSecret ||
        secretBuf.length !== expectedBuf.length ||
        !crypto.timingSafeEqual(secretBuf, expectedBuf)
      ) {
        logger.warn(`Invalid webhook secret for ${sourceName}`, { ip: req.ip });
        throw new UnauthorizedError('Invalid webhook authentication secret');
      }
    } else {
      logger.warn(`Missing authentication headers for ${sourceName}`, { ip: req.ip });
      throw new UnauthorizedError('Authentication credentials required (secret or signature)');
    }

    req.webhookSource = sourceName;
    next();
  };
}

