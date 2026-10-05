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
import { createCheckoutSession, createCustomerPortalSession } from '../services/stripe.service';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
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

/** Whether Stripe is configured on this environment (drives the billing UI notice). */
function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
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
  if (!businessId) {
    res.json({ success: true, data: { subscription: null, trialDaysLeft: null, paymentsConfigured: paymentsConfigured() } });
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
        paymentsConfigured: paymentsConfigured(),
      },
    });
  } catch (error) {
    logger.warn('Subscription lookup failed, returning null subscription', {
      businessId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.json({ success: true, data: { subscription: null, trialDaysLeft: null, paymentsConfigured: paymentsConfigured() } });
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
    const result = await createCheckoutSession(businessId, planSlug, successUrl, cancelUrl);
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
    const result = await createCustomerPortalSession(businessId, returnUrl);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Failed to create customer portal session' });
  }
});

export default router;
