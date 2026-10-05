import { Router, Request, Response } from 'express';
import { getOwnerDashboardStats, getFinancialMetrics } from '../services/owner.service';
import { authenticate, requireOwnerAccess } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { query } from '../utils/database';
import logger from '../utils/logger';
import { getActiveSubscription, clearSubCache } from '../services/subscription.service';
import { cancelStripeSubscription, resumeStripeSubscription } from '../services/stripe.service';
import { validateSettingValue } from '../services/settings.service';
import { listContactInquiries } from '../services/contact-inquiry.service';

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
router.get('/subscriptions', authenticate, requireOwnerAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const result = await query(`
      SELECT s.id, s.business_id, s.plan_id, s.status, s.current_period_start, s.current_period_end,
             s.trial_ends_at, s.canceled_at, s.external_subscription_id, s.metadata, s.created_at,
             b.name as business_name, b.slug as business_slug,
             p.name as plan_name, p.price_monthly, p.currency
      FROM subscriptions s
      LEFT JOIN businesses b ON b.id = s.business_id
      LEFT JOIN plans p ON p.id = s.plan_id
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({ success: true, data: result.rows, meta: { page, limit } });
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

router.post('/subscriptions/:id/cancel', authenticate, requireOwnerAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const subResult = await query(`SELECT id, business_id, external_subscription_id FROM subscriptions WHERE id = $1`, [req.params.id]);
    if (subResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Subscription not found' });
      return;
    }
    const sub = subResult.rows[0]!;
    await query(`UPDATE subscriptions SET status = 'canceled', canceled_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
    if (sub.external_subscription_id) {
      try {
        await cancelStripeSubscription(sub.external_subscription_id);
      } catch (stripeError: any) {
        logger.warn('Failed to cancel Stripe subscription', { subscriptionId: sub.external_subscription_id, error: stripeError?.message });
      }
    }
    clearSubCache(sub.business_id);
    logger.info('Subscription canceled by owner', { subscriptionId: req.params.id, canceledBy: req.user?.id });
    res.json({ success: true, message: 'Subscription canceled' });
  } catch (error) {
    logger.error('Failed to cancel subscription', { error });
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

router.post('/subscriptions/:id/activate', authenticate, requireOwnerAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const subResult = await query(`SELECT id, business_id, external_subscription_id FROM subscriptions WHERE id = $1`, [req.params.id]);
    if (subResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Subscription not found' });
      return;
    }
    const sub = subResult.rows[0]!;
    await query(`UPDATE subscriptions
      SET status = 'active', canceled_at = NULL,
          metadata = metadata || CASE WHEN status <> 'active' THEN jsonb_build_object('converted_at', NOW()) ELSE '{}'::jsonb END,
          updated_at = NOW()
      WHERE id = $1 RETURNING *`, [req.params.id]);
    if (sub.external_subscription_id) {
      try {
        await resumeStripeSubscription(sub.external_subscription_id);
      } catch (stripeError: any) {
        logger.warn('Failed to resume Stripe subscription', { subscriptionId: sub.external_subscription_id, error: stripeError?.message });
      }
    }
    clearSubCache(sub.business_id);
    logger.info('Subscription activated by owner', { subscriptionId: req.params.id, activatedBy: req.user?.id });
    res.json({ success: true, message: 'Subscription activated' });
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
      `SELECT setting_key, setting_value, data_type, description, is_system
       FROM settings
       WHERE business_id IS NULL AND is_system = true
       ORDER BY setting_key`
    );
    const settings = result.rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = {
        value: row.setting_value,
        dataType: row.data_type,
        description: row.description,
        isSystem: row.is_system,
      };
      return acc;
    }, {});
    res.json({ success: true, data: settings });
  } catch (error) {
    logger.error('Failed to fetch settings', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

router.put('/settings', authenticate, requireOwnerAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settings = (req.body as Record<string, string>).settings ?? {};
    const results: any[] = [];
    for (const [key, value] of Object.entries(settings)) {
      const existing = await query(
        `SELECT data_type FROM settings WHERE setting_key = $1 AND business_id IS NULL AND is_system = true LIMIT 1`,
        [key]
      );
      if (!existing.rows[0]) {
        res.status(404).json({ success: false, error: `Global setting '${key}' not found` });
        return;
      }
      const dataType = existing.rows[0].data_type;
      validateSettingValue(dataType, typeof value === 'string' ? value : String(value));
      const result = await query(
        `UPDATE settings SET setting_value = $1, updated_at = NOW()
         WHERE setting_key = $2 AND business_id IS NULL AND is_system = true RETURNING *`,
        [typeof value === 'string' ? value : String(value), key]
      );
      results.push(result.rows[0]);
    }
  logger.info('Settings updated by owner', { updatedBy: req.user?.id });
  res.json({ success: true, data: results });
} catch (error: any) {
  logger.error('Failed to update settings', { error });
  const message = error?.message || 'Failed to update settings';
  res.status(400).json({ success: false, error: message });
}
});

router.post('/settings', authenticate, requireOwnerAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { key, value = '', dataType = 'string', description = '' } = req.body ?? {};
    if (typeof key !== 'string' || !/^[a-z0-9_]{1,100}$/i.test(key.trim())) {
      res.status(400).json({ success: false, error: 'Key must contain 1-100 letters, numbers, or underscores' });
      return;
    }
    const normalizedKey = key.trim();
    const supportedTypes = ['string', 'integer', 'decimal', 'boolean', 'json'];
    if (!supportedTypes.includes(dataType)) {
      res.status(400).json({ success: false, error: `dataType must be one of: ${supportedTypes.join(', ')}` });
      return;
    }
    if (typeof description !== 'string' || description.length > 500) {
      res.status(400).json({ success: false, error: 'Description must be 500 characters or fewer' });
      return;
    }
    const stringValue = typeof value === 'string' ? value : String(value);
    validateSettingValue(dataType, stringValue);
    const result = await query(
      `INSERT INTO settings (setting_key, setting_value, data_type, description, is_system, business_id)
       VALUES ($1, $2, $3, $4, true, NULL)
       RETURNING setting_key, setting_value, data_type, description, is_system`,
      [normalizedKey, stringValue, dataType, description.trim() || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ success: false, error: 'A global setting with this key already exists' });
      return;
    }
    const message = error?.message || 'Failed to create global setting';
    res.status(400).json({ success: false, error: message });
  }
});

// Contact Inquiries
router.get('/contact-inquiries', authenticate, requireOwnerAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const source = req.query.source as string | undefined;
    const result = await listContactInquiries({ page, limit, source });
    res.json({ success: true, data: result.data, meta: result.meta });
  } catch (error: any) {
    logger.error('Failed to fetch contact inquiries', { error });
    res.status(500).json({ success: false, message: 'Failed to fetch contact inquiries' });
  }
});

export default router;
