import { Router, Response } from 'express';
import {
  listPlans,
  getActiveSubscription,
  getSubscriptionHistory,
  getUsage,
  getPlanLimit,
  trialDaysLeft,
  createPlan,
  updatePlan,
  deletePlan,
  getPlanById,
  KNOWN_LIMIT_METRICS,
} from '../services/subscription.service';
import { createCheckoutSession, createCustomerPortalSession } from '../services/stripe.service';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { AuthenticatedRequest, Plan } from '../types';

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

router.get('/subscription', async (req, res: Response): Promise<void> => {
  const businessId = tid(req as AuthenticatedRequest);
  if (!businessId) {
    res.json({ success: true, data: null });
    return;
  }
  const sub = await getActiveSubscription(businessId);
  res.json({ success: true, data: sub ? { ...sub, trialDaysLeft: trialDaysLeft(sub) } : null });
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
  try {
    const result = await createCustomerPortalSession(businessId, returnUrl);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Failed to create customer portal session' });
  }
});

export default router;
