import { Router, Request, Response } from 'express';
import { getOwnerDashboardStats, getFinancialMetrics } from '../services/owner.service';
import { authenticate, requireOwnerAccess } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { query } from '../utils/database';
import logger from '../utils/logger';

const router = Router();

// Owner Dashboard
router.get('/dashboard', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  const stats = await getOwnerDashboardStats();
  res.json({ success: true, data: stats });
});

router.get('/financials', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  const metrics = await getFinancialMetrics();
  res.json({ success: true, data: metrics });
});

// User Management
router.get('/users', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  try {
    const result = await query(`
      SELECT id, email, role, status, business_id, employee_number, first_name, last_name, created_at
      FROM staff_users
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to fetch users', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

router.get('/users/:id', authenticate, requireOwnerAccess, async (req, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT id, email, role, status, business_id, employee_number, first_name, last_name, created_at
       FROM staff_users WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to fetch user', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

router.put('/users/:id', authenticate, requireOwnerAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, status } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (role) {
      paramCount++;
      updates.push(`role = $${paramCount}`);
      values.push(role);
    }
    if (status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(status);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }

    paramCount++;
    values.push(req.params.id);
    const result = await query(
      `UPDATE staff_users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, email, role, status, business_id, employee_number, first_name, last_name`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    logger.info('User updated by owner', { userId: req.params.id, updatedBy: (req as AuthenticatedRequest).user?.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to update user', { error });
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

router.delete('/users/:id', authenticate, requireOwnerAccess, async (req, res: Response): Promise<void> => {
  try {
    const result = await query(
      `UPDATE staff_users SET deleted_at = NOW() WHERE id = $1 RETURNING id, email`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    logger.info('User deleted by owner', { userId: req.params.id, deletedBy: (req as AuthenticatedRequest).user?.id });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete user', { error });
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

// Subscription Oversight
router.get('/subscriptions', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  try {
    const result = await query(`
      SELECT s.id, s.business_id, s.plan_id, s.status, s.current_period_start, s.current_period_end,
             s.trial_ends_at, s.canceled_at, s.external_subscription_id, s.metadata,
             p.name as plan_name, p.price_monthly, p.currency
      FROM subscriptions s
      LEFT JOIN plans p ON p.id = s.plan_id
      ORDER BY s.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to fetch subscriptions', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch subscriptions' });
  }
});

router.get('/subscriptions/:id', authenticate, requireOwnerAccess, async (req, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT s.*, p.name as plan_name, p.price_monthly, p.currency
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Subscription not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to fetch subscription', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch subscription' });
  }
});

router.post('/subscriptions/:id/cancel', authenticate, requireOwnerAccess, async (req, res: Response): Promise<void> => {
  try {
    const result = await query(
      `UPDATE subscriptions SET status = 'canceled', canceled_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Subscription not found' });
      return;
    }
    logger.info('Subscription canceled by owner', { subscriptionId: req.params.id, canceledBy: (req as AuthenticatedRequest).user?.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to cancel subscription', { error });
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

router.post('/subscriptions/:id/activate', authenticate, requireOwnerAccess, async (req, res: Response): Promise<void> => {
  try {
    const result = await query(
      `UPDATE subscriptions SET status = 'active', canceled_at = NULL WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Subscription not found' });
      return;
    }
    logger.info('Subscription activated by owner', { subscriptionId: req.params.id, activatedBy: (req as AuthenticatedRequest).user?.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to activate subscription', { error });
    res.status(500).json({ success: false, error: 'Failed to activate subscription' });
  }
});

// API Configuration
router.get('/api-config', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT setting_key, setting_value, data_type, description FROM settings WHERE setting_key LIKE 'api_%' ORDER BY setting_key`
    );
    const config = result.rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Failed to fetch API config', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch API config' });
  }
});

router.put('/api-config', authenticate, requireOwnerAccess, async (req, res: Response): Promise<void> => {
  try {
    const { configs } = req.body;
    const results = [];
    for (const [key, value] of Object.entries(configs)) {
      const result = await query(
        `UPDATE settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2 RETURNING *`,
        [value as string, key]
      );
      results.push(result.rows[0]);
    }
    logger.info('API config updated by owner', { updatedBy: (req as AuthenticatedRequest).user?.id });
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Failed to update API config', { error });
    res.status(500).json({ success: false, error: 'Failed to update API config' });
  }
});

// Global Settings
router.get('/settings', authenticate, requireOwnerAccess, async (_req, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT setting_key, setting_value, data_type, description FROM settings ORDER BY setting_key`
    );
    const settings = result.rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    res.json({ success: true, data: settings });
  } catch (error) {
    logger.error('Failed to fetch settings', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

router.put('/settings', authenticate, requireOwnerAccess, async (req, res: Response): Promise<void> => {
  try {
    const { settings } = req.body;
    const results = [];
    for (const [key, value] of Object.entries(settings)) {
      const result = await query(
        `UPDATE settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2 RETURNING *`,
        [value as string, key]
      );
      results.push(result.rows[0]);
    }
    logger.info('Settings updated by owner', { updatedBy: (req as AuthenticatedRequest).user?.id });
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Failed to update settings', { error });
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

export default router;