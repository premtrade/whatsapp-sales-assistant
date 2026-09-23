import { Router, Request, Response } from 'express';
import { getPool } from '../utils/database';
import { ApiResponse } from '../types';
import { createClient } from 'redis';

const router = Router();

// Redis is best-effort: a Redis outage must NOT take down /health.
// Database failure => 503. Redis failure => 200 with degraded status.
router.get('/', async (_req: Request, res: Response<ApiResponse>): Promise<void> => {
  const checks: Record<string, string> = {};
  let dbHealthy = true;

  // Database check (authoritative)
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    checks.database = 'connected';
  } catch {
    checks.database = 'disconnected';
    dbHealthy = false;
  }

  // Redis check (non-blocking, 3s timeout, never fails the endpoint)
  try {
    const redisHost = process.env.REDIS_HOST || 'redis';
    const redisPort = process.env.REDIS_PORT || '6379';
    const redisPassword = process.env.REDIS_PASSWORD || '';
    const redisUrl = redisPassword
      ? `redis://:${encodeURIComponent(redisPassword)}@${redisHost}:${redisPort}`
      : `redis://${redisHost}:${redisPort}`;
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 3000 } });
    client.on('error', () => {});
    await client.connect();
    try {
      await Promise.race([
        client.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('redis ping timeout')), 3000)),
      ]);
      checks.redis = 'connected';
    } finally {
      try {
        await client.disconnect();
      } catch {
        await client.quit().catch(() => undefined);
      }
    }
  } catch {
    checks.redis = 'disconnected';
  }

  const degraded = checks.redis === 'disconnected';
  const statusCode = dbHealthy ? 200 : 503;
  res.status(statusCode).json({
    success: dbHealthy,
    data: {
      status: !dbHealthy ? 'unhealthy' : degraded ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      ...checks,
    },
  } as ApiResponse);
});

router.get('/ready', async (_req: Request, res: Response<ApiResponse>): Promise<void> => {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');

    res.json({
      success: true,
      data: { status: 'ready' },
    });
  } catch {
    res.status(503).json({
      success: false,
      data: { status: 'not ready' },
    } as ApiResponse);
  }
});

export { router as healthRoutes };
