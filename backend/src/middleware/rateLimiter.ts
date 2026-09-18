import rateLimit from 'express-rate-limit';
import { config } from '../config';
import logger from '../utils/logger';

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
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
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
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

