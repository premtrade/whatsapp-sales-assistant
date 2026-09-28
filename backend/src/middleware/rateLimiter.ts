import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * IPv6-safe IP normalization for rate-limit keys.
 * express-rate-limit v7.5.x (installed) does not export ipKeyGenerator,
 * so we inline the same /56-subnet handling for IPv6 here.
 */
function safeIpKey(req: Request): string {
  const ip = req.ip ?? 'unknown';
  if (ip.includes(':')) {
    // IPv6: bucket by /56-equivalent prefix so one device rotating
    // interface identifiers can't dodge the limiter, while distinct
    // users on different prefixes don't share a bucket.
    const parts = ip.split(':').filter((p) => p.length > 0);
    return parts.slice(0, 4).join(':') || ip;
  }
  return ip;
}

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  // Health checks must never be rate-limited — uptime monitors poll frequently.
  // NOTE: this limiter is mounted globally (app.use(apiRateLimiter)), so for a
  // request to /api/health, req.path is '/api/health' (not '/health'). Match
  // both, plus req.originalUrl as a fallback.
  skip: (req) => req.path === '/health' || req.path === '/api/health' || req.originalUrl.startsWith('/health') || req.originalUrl.startsWith('/api/health'),
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 50 failed attempts per 15 min per (IP + email) bucket. The old
  // `max: 10` keyed only by IP blocked *everyone* behind the same
  // nginx/Vercel egress IP after 10 failures — the exact 429 storm seen on /api/auth/login.
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  // Successful logins don't count — only failed attempts burn the budget,
  // so normal users never trip this by logging in/out during the day.
  skipSuccessfulRequests: true,
  // Key by IP + email so one attacker's failures don't lock out other users
  // sharing the same egress IP. safeIpKey() keeps IPv6 subnets handled safely.
  keyGenerator: (req) => {
    const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
    const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase().trim() : 'no-email';
    return `${safeIpKey(req)}:${email}`;
  },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    });
  },
});

export const createRateLimiter = (windowMs: number, max: number) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  });

export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 webhook requests/min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Webhook rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      success: false,
      error: 'Webhook rate limit exceeded',
      code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
    });
  },
});

/**
 * Creates a per-source rate limiter for webhooks.
 * Uses a combination of source name (from webhookSource) and IP as the key.
 */
export const createWebhookSourceRateLimiter = (sourceName: string, max: number = 60, windowMs: number = 60 * 1000) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const webhookReq = req as any;
      const source = webhookReq.webhookSource || 'unknown';
      return `${source}:${req.ip}`;
    },
    handler: (req, res) => {
      logger.warn('Webhook source rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        source: (req as any).webhookSource,
      });
      res.status(429).json({
        success: false,
        error: 'Webhook source rate limit exceeded',
        code: 'WEBHOOK_SOURCE_RATE_LIMIT_EXCEEDED',
      });
    },
  });

export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 admin actions/min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Admin rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      success: false,
      error: 'Admin action rate limit exceeded',
      code: 'ADMIN_RATE_LIMIT_EXCEEDED',
    });
  },
});

