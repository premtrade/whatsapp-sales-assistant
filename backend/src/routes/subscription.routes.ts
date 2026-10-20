import { Router, Response } from 'express';
import {
  listPlans,
  getActiveSubscription,
  getSubscriptionHistory,
  getUsage,
  getPlanLimit,
  trialDaysLeft,
  gracePeriodDaysLeft,
  isInGracePeriod,
  createPlan,
  updatePlan,
  deletePlan,
  getPlanById,
  KNOWN_LIMIT_METRICS,
} from '../services/subscription.service';
import { getPaymentProvider, getPaymentProviderInfo, paymentsConfigured } from '../services/billing';
import {
  scheduleCancellation,
  clearScheduledCancellation,
} from '../services/billing/cancellation.service';
import {
  listPaymentRequests,
  confirmPaymentRequest,
  rejectPaymentRequest,
  getPaymentRequest,
} from '../services/billing/paymentRequests.service';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { query } from '../utils/database';
import logger from '../utils/logger';
import { AuthenticatedRequest, Plan } from '../types';

// Environments that provide billing return URLs. Sources are combined (not
// first-match) so a deployment works with any of them: explicit
// ALLOWED_RETURN_HOSTS, the frontend's public URL, or the CORS origin list
// (CORS_ORIGINS) which production already sets.
const RETURN_URL_ENV_SOURCES = [
  'ALLOWED_RETURN_HOSTS',
  'FRONTEND_PUBLIC_URL',
  'VITE_FRONTEND_URL',
  'FRONTEND_URL',
  'CORS_ORIGINS',
];

/** Accepts both bare hosts (`waflo.vercel.app`) and origins (`https://waflo.vercel.app`). */
function normalizeHost(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('://')) {
    try {
      return new URL(v).host.toLowerCase();
    } catch {
      return null;
    }
  }
  return v;
}

function isAllowedReturnUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return true;
  try {
    const host = new URL(trimmed).host.toLowerCase();
    const allowedHosts = RETURN_URL_ENV_SOURCES
      .flatMap((name) => (process.env[name] || '').split(','))
      .map(normalizeHost)
      .filter((h): h is string => Boolean(h))
      .filter((h, i, arr) => arr.indexOf(h) === i);
    if (allowedHosts.length === 0) {
      return host === 'localhost' || host === '127.0.0.1';
    }
    return allowedHosts.includes(host);
  } catch {
    return false;
  }
}

/**
 * Whether this environment can collect money, and which provider is doing it.
 * The billing UI uses this to decide between a hosted checkout and payment
 * instructions.
 */
function paymentProviderState() {
  try {
    return { paymentsConfigured: paymentsConfigured(), paymentProvider: getPaymentProviderInfo() };
  } catch (error: any) {
    logger.warn('Payment provider unavailable', { error: error?.message });
    return { paymentsConfigured: false, paymentProvider: null };
  }
}

const router = Router();

router.get('/plans', async (_req, res: Response): Promise<void> => {
  const plans = await listPlans({ publicOnly: true, activeOnly: true });
  res.json({ success: true, data: plans });
});

router.use(authenticate);

function tid(req: AuthenticatedRequest): string | null {
  return req.user?.businessId || req.user?.tenantId || null;
}

router.get('/admin/plans', requireRole('super_admin'), async (_req, res: Response): Promise<void> => {
  const plans = await listPlans({ publicOnly: false, activeOnly: false });
  res.json({ success: true, data: plans });
});

router.get('/admin/plans/:id', requireRole('super_admin'), async (req, res: Response): Promise<void> => {
  const plan = await getPlanById(req.params.id!);
  res.json({ success: true, data: plan });
});

router.post('/admin/plans', requireRole('super_admin'), async (req, res: Response): Promise<void> => {
  const plan = await createPlan(req.body);
  res.status(201).json({ success: true, data: plan });
});

router.put('/admin/plans/:id', requireRole('super_admin'), async (req, res: Response): Promise<void> => {
  const plan = await updatePlan(req.params.id!, req.body);
  res.json({ success: true, data: plan });
});

router.delete('/admin/plans/:id', requireRole('super_admin'), async (req, res: Response): Promise<void> => {
  await deletePlan(req.params.id!);
  res.json({ success: true, message: 'Plan deactivated' });
});

// GET /subscription — wrapped as { subscription, trialDaysLeft } to match
// frontend getSubscription(). Never 500s: billing-table issues (e.g. 053 not
// applied on an env) must not break every page via TrialBanner.
router.get('/subscription', async (req, res: Response): Promise<void> => {
  const businessId = tid(req as AuthenticatedRequest);
  const providerState = paymentProviderState();
  if (!businessId) {
    res.json({ success: true, data: { subscription: null, trialDaysLeft: null, ...providerState } });
    return;
  }
  try {
    const sub = await getActiveSubscription(businessId);
    const isGrace = isInGracePeriod(sub);
    res.json({
      success: true,
      data: {
        subscription: sub,
        trialDaysLeft: isGrace ? null : trialDaysLeft(sub),
        gracePeriodDaysLeft: isGrace ? gracePeriodDaysLeft(sub) : null,
        isInGracePeriod: isGrace,
        ...providerState,
      },
    });
  } catch (error) {
    logger.warn('Subscription lookup failed, returning null subscription', {
      businessId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.json({ success: true, data: { subscription: null, trialDaysLeft: null, ...providerState } });
  }
});

router.get('/subscription/history', async (req, res: Response): Promise<void> => {
  const businessId = tid(req as AuthenticatedRequest);
  if (!businessId) {
    res.json({ success: true, data: [] });
    return;
  }
  const h = await getSubscriptionHistory(businessId);
  res.json({ success: true, data: h });
});

/**
 * Self-service cancellation. The customer keeps access until the period they
 * have already paid for ends.
 */
router.post('/subscription/cancel', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const businessId = tid(req as AuthenticatedRequest);
  if (!businessId) {
    res.status(400).json({ success: false, message: 'Tenant context required' });
    return;
  }
  try {
    const subscription = await scheduleCancellation(businessId);
    res.json({
      success: true,
      data: { cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? null },
      message: 'Your subscription will end at the close of the current billing period.',
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || 'Failed to cancel the subscription' });
  }
});

/** Undoes a scheduled cancellation. */
router.post('/subscription/resume', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const businessId = tid(req as AuthenticatedRequest);
  if (!businessId) {
    res.status(400).json({ success: false, message: 'Tenant context required' });
    return;
  }
  try {
    await clearScheduledCancellation(businessId);
    res.json({ success: true, message: 'Your subscription will continue as normal.' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || 'Failed to resume the subscription' });
  }
});

/** The tenant's own billing history: what was charged and what is still
 * outstanding. Used by the Billing page so an offline customer can reconcile
 * their own payments.
 */
router.get('/subscription/payments', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const businessId = tid(req as AuthenticatedRequest);
  if (!businessId) {
    res.status(400).json({ success: false, message: 'Tenant context required' });
    return;
  }
  try {
    const payments = await query(
      `SELECT id, amount, currency, status, provider, provider_payment_id, method, paid_at, created_at
         FROM payments
        WHERE business_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [businessId]
    );
    const requests = await query(
      `SELECT id, reference, amount, currency, status, method, created_at, confirmed_at
         FROM payment_requests
        WHERE business_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [businessId]
    );
    res.json({
      success: true,
      data: { payments: payments.rows, paymentRequests: requests.rows },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Failed to load payment history' });
  }
});

/** The tenant's outstanding offline payment request, if any. */
router.get('/subscription/payment-request', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const businessId = tid(req as AuthenticatedRequest);
  if (!businessId) {
    res.status(400).json({ success: false, message: 'Tenant context required' });
    return;
  }
  try {
    const result = await query(
      `SELECT id, reference, amount, currency, status, method, created_at
         FROM payment_requests
        WHERE business_id = $1 AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1`,
      [businessId]
    );
    res.json({ success: true, data: result.rows[0] ?? null });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Failed to load payment request' });
  }
});

/** Current-month usage against plan limits for every metered metric. */
router.get('/usage', async (req, res: Response): Promise<void> => {
  const businessId = tid(req as AuthenticatedRequest);
  if (!businessId) {
    res.json({ success: true, data: {} });
    return;
  }
  const sub = await getActiveSubscription(businessId);
  const data: Record<string, { used: number; limit: number | null }> = {};
  for (const metric of KNOWN_LIMIT_METRICS) {
    const record = await getUsage(businessId, metric);
    data[metric] = {
      used: record?.used ?? 0,
      limit: sub ? getPlanLimit(sub.plan as Plan, metric) ?? null : null,
    };
  }
  res.json({ success: true, data });
});

router.post('/checkout-session', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const businessId = req.user?.businessId || req.user?.tenantId;
  if (!businessId) {
    res.status(400).json({ success: false, message: 'Tenant context required' });
    return;
  }
  const { planSlug, successUrl, cancelUrl } = req.body;
  if (!planSlug || !successUrl || !cancelUrl) {
    res.status(400).json({ success: false, message: 'planSlug, successUrl, and cancelUrl are required' });
    return;
  }
  if (!isAllowedReturnUrl(successUrl) || !isAllowedReturnUrl(cancelUrl)) {
    res.status(400).json({ success: false, message: 'successUrl and cancelUrl must be relative or match allowed hosts' });
    return;
  }
  try {
    const result = await getPaymentProvider().createCheckoutSession({
      businessId,
      planSlug,
      successUrl,
      cancelUrl,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Failed to create checkout session' });
  }
});

router.post('/customer-portal', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const businessId = req.user?.businessId || req.user?.tenantId;
  if (!businessId) {
    res.status(400).json({ success: false, message: 'Tenant context required' });
    return;
  }
  const { returnUrl } = req.body;
  if (!returnUrl) {
    res.status(400).json({ success: false, message: 'returnUrl is required' });
    return;
  }
  if (!isAllowedReturnUrl(returnUrl)) {
    res.status(400).json({ success: false, message: 'returnUrl must be relative or match allowed hosts' });
    return;
  }
  try {
    const result = await getPaymentProvider().createCustomerPortalSession(businessId, returnUrl);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Failed to create customer portal session' });
  }
});

// --- Offline payment requests (bank transfer / invoice) ---------------------
// Used when no card processor is available for the platform's country of
// incorporation. A platform owner confirms receipt, which activates the
// subscription through the shared billing-event pipeline.

router.get('/admin/payment-requests', requireRole('super_admin'), async (req, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const requests = await listPaymentRequests(status ? { status } : {});
    res.json({ success: true, data: requests });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Failed to load payment requests' });
  }
});

router.get('/admin/payment-requests/:id', requireRole('super_admin'), async (req, res: Response): Promise<void> => {
  try {
    const request = await getPaymentRequest(req.params.id!);
    res.json({ success: true, data: request });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error?.message || 'Payment request not found' });
  }
});

router.post('/admin/payment-requests/:id/confirm', requireRole('super_admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const request = await confirmPaymentRequest(
      req.params.id!,
      req.user?.id ?? null,
      typeof req.body?.notes === 'string' ? req.body.notes : undefined
    );
    res.json({ success: true, data: request, message: 'Payment confirmed and subscription activated' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || 'Failed to confirm payment' });
  }
});

router.post('/admin/payment-requests/:id/reject', requireRole('super_admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const request = await rejectPaymentRequest(
      req.params.id!,
      req.user?.id ?? null,
      typeof req.body?.notes === 'string' ? req.body.notes : undefined
    );
    res.json({ success: true, data: request, message: 'Payment request rejected' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.message || 'Failed to reject payment' });
  }
});

export default router;