import { Router, Request, Response } from 'express';
import { getPool, closePool } from '../utils/database';
import { ApiResponse } from '../types';

const router = Router();

router.get('/', async (_req: Request, res: Response<ApiResponse>): Promise<void> => {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Service unavailable',
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      },
    } as ApiResponse);
  }
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
