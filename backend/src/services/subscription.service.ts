import { query } from '../utils/database';
import { NotFoundError, BadRequestError, PaymentRequiredError, ForbiddenError } from '../utils/errors';
import { invalidateCache, getCached } from '../utils/cache';
import { Plan, Subscription, SubscriptionWithPlan, UsageMetric, UsageRecord } from '../types';
import logger from '../utils/logger';

export const TRIAL_DAYS = 14;
export const GRACE_PERIOD_DAYS = 3;
export const USAGE_CACHE_TTL_SECONDS = 15 * 60;
export const SUBSCRIPTION_CACHE_TTL_SECONDS = 5 * 60;

export const KNOWN_LIMIT_METRICS = ['ai_responses', 'staff_users', 'locations', 'whatsapp_numbers'] as const;
type KnownLimitMetric = (typeof KNOWN_LIMIT_METRICS)[number];

function isKnownLimitMetric(metric: string): metric is KnownLimitMetric {
  return (KNOWN_LIMIT_METRICS as readonly string[]).includes(metric);
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isUnlimited(limit: number | undefined): boolean {
  return limit === -1;
}

export function getPlanLimit(plan: Plan, metric: string): number | undefined {
  if (!isKnownLimitMetric(metric)) return undefined;
  return toNumber(plan.limits?.[metric]);
}

export async function listPlans(options?: { publicOnly?: boolean; activeOnly?: boolean }): Promise<Plan[]> {
  const publicOnly = options?.publicOnly ?? true;
  const activeOnly = options?.activeOnly ?? true;
  const conditions: string[] = [];
  if (activeOnly) conditions.push('is_active = TRUE');
  if (publicOnly) conditions.push('is_public = TRUE');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query<Plan>(
    `SELECT id, name, slug, price_monthly, price_yearly, currency, features, limits,
            sort_order, is_active, is_public, metadata, created_at, updated_at
     FROM plans ${where} ORDER BY sort_order ASC, price_monthly ASC`,
    []
  );
  return result.rows;
}

export async function getPlanBySlug(slug: string): Promise<Plan> {
  const result = await query<Plan>(
    `SELECT id, name, slug, price_monthly, price_yearly, currency, features, limits,
            sort_order, is_active, is_public, metadata, created_at, updated_at
     FROM plans WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  const plan = result.rows[0];
  if (!plan) throw new NotFoundError(`Plan '${slug}' not found`);
  return plan;
}

export async function getPlanById(id: string): Promise<Plan> {
  const result = await query<Plan>(
    `SELECT id, name, slug, price_monthly, price_yearly, currency, features, limits,
            sort_order, is_active, is_public, metadata, created_at, updated_at
     FROM plans WHERE id = $1 LIMIT 1`,
    [id]
  );
  const plan = result.rows[0];
  if (!plan) throw new NotFoundError('Plan not found');
  return plan as Plan;
}

export async function createPlan(data: {
  name: string
  slug: string
  price_monthly: number
  price_yearly?: number | null
  currency?: string
  features?: Record<string, unknown>
  limits?: Record<string, unknown>
  sort_order?: number
  is_active?: boolean
  is_public?: boolean
  metadata?: Record<string, unknown>
}): Promise<Plan> {
  const result = await query<Plan>(
    `INSERT INTO plans (name, slug, price_monthly, price_yearly, currency, features, limits, sort_order, is_active, is_public, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb)
     RETURNING id, name, slug, price_monthly, price_yearly, currency, features, limits,
               sort_order, is_active, is_public, metadata, created_at, updated_at`,
    [
      data.name,
      data.slug,
      data.price_monthly,
      data.price_yearly ?? null,
      data.currency || 'USD',
      JSON.stringify(data.features || {}),
      JSON.stringify(data.limits || {}),
      data.sort_order ?? 0,
      data.is_active ?? true,
      data.is_public ?? true,
      JSON.stringify(data.metadata || {}),
    ]
  );
  return result.rows[0] as Plan;
}

export async function updatePlan(id: string, data: {
  name?: string
  price_monthly?: number
  price_yearly?: number | null
  currency?: string
  features?: Record<string, unknown>
  limits?: Record<string, unknown>
  sort_order?: number
  is_active?: boolean
  is_public?: boolean
  metadata?: Record<string, unknown>
}): Promise<Plan> {
  const sets: string[] = ['updated_at = NOW()']
  const params: unknown[] = [id]
  let idx = 2
  if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name) }
  if (data.price_monthly !== undefined) { sets.push(`price_monthly = $${idx++}`); params.push(data.price_monthly) }
  if (data.price_yearly !== undefined) { sets.push(`price_yearly = $${idx++}`); params.push(data.price_yearly) }
  if (data.currency !== undefined) { sets.push(`currency = $${idx++}`); params.push(data.currency) }
  if (data.features !== undefined) { sets.push(`features = $${idx++}::jsonb`); params.push(JSON.stringify(data.features)) }
  if (data.limits !== undefined) { sets.push(`limits = $${idx++}::jsonb`); params.push(JSON.stringify(data.limits)) }
  if (data.sort_order !== undefined) { sets.push(`sort_order = $${idx++}`); params.push(data.sort_order) }
  if (data.is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.is_active) }
  if (data.is_public !== undefined) { sets.push(`is_public = $${idx++}`); params.push(data.is_public) }
  if (data.metadata !== undefined) { sets.push(`metadata = $${idx++}::jsonb`); params.push(JSON.stringify(data.metadata)) }

  const result = await query<Plan>(
    `UPDATE plans SET ${sets.join(', ')} WHERE id = $1 RETURNING id, name, slug, price_monthly, price_yearly, currency, features, limits, sort_order, is_active, is_public, metadata, created_at, updated_at`,
    params
  )
  const plan = result.rows[0]
  if (!plan) throw new NotFoundError('Plan not found')
  return plan
}

export async function deletePlan(id: string): Promise<void> {
  const result = await query(`UPDATE plans SET is_active = FALSE, is_public = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`, [id])
  if (result.rows.length === 0) throw new NotFoundError('Plan not found')
}
const SUB_COLS = `s.id, s.business_id, s.plan_id, s.status, s.current_period_start, s.current_period_end, s.trial_ends_at, s.canceled_at, s.grace_period_ends_at, s.external_customer_id, s.external_subscription_id, s.metadata, s.created_at, s.updated_at, json_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'price_monthly', p.price_monthly, 'price_yearly', p.price_yearly, 'currency', p.currency, 'features', p.features, 'limits', p.limits, 'sort_order', p.sort_order, 'is_active', p.is_active, 'is_public', p.is_public, 'metadata', p.metadata, 'created_at', p.created_at, 'updated_at', p.updated_at) AS plan`;

export async function getActiveSubscription(businessId: string): Promise<SubscriptionWithPlan | null> {
  return getCached(`subscription:active:${businessId}`, async () => {
    const r = await query<SubscriptionWithPlan>(`SELECT ${SUB_COLS} FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.business_id = $1 AND s.status IN ('trialing','active','past_due') ORDER BY s.created_at DESC LIMIT 1`, [businessId]);
    return r.rows[0] || null;
  }, SUBSCRIPTION_CACHE_TTL_SECONDS);
}

export async function getHistory(businessId: string): Promise<SubscriptionWithPlan[]> {
  const r = await query<SubscriptionWithPlan>(`SELECT ${SUB_COLS} FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.business_id = $1 ORDER BY s.created_at DESC`, [businessId]);
  return r.rows;
}

export function isUsable(sub: SubscriptionWithPlan | null): boolean {
  if (!sub) return false;
  if (sub.status === 'active') return true;
  if (sub.status === 'trialing') return !sub.trial_ends_at || new Date(sub.trial_ends_at).getTime() > Date.now();
  if (sub.status === 'past_due') return !sub.grace_period_ends_at || new Date(sub.grace_period_ends_at).getTime() > Date.now();
  return false;
}

export function trialDaysLeft(sub: SubscriptionWithPlan | null): number | null {
  if (!sub || sub.status !== 'trialing' || !sub.trial_ends_at) return null;
  return Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000));
}

export function clearSubCache(businessId: string): void {
  invalidateCache(`subscription:active:${businessId}`);
  invalidateCache(`usage:${businessId}:`);
}

export function assertUsable(sub: SubscriptionWithPlan | null): void {
  if (isUsable(sub)) return;
  if (!sub) throw new PaymentRequiredError('No subscription found. Please start a trial or subscribe.');
  if (sub.status === 'past_due') throw new PaymentRequiredError('Payment is past due. Please update billing to continue.');
  if (sub.status === 'expired') throw new PaymentRequiredError('Trial expired. Please upgrade to continue.');
  if (sub.status === 'canceled') throw new ForbiddenError('Subscription is canceled.');
  throw new PaymentRequiredError('Subscription is not active.');
}
export async function createTrial(businessId: string, slug = 'starter'): Promise<SubscriptionWithPlan> {
  const existing = await getActiveSubscription(businessId);
  if (existing) return existing;
  let plan: Plan;
  try { plan = await getPlanBySlug(slug); } catch { plan = await getPlanBySlug('starter'); }
  await query(`INSERT INTO subscriptions (business_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, metadata) VALUES ($1,$2,'trialing',NOW(),NOW()+($3||' days')::interval,NOW()+($3||' days')::interval,'{"notes":"Trial created"}'::jsonb) ON CONFLICT DO NOTHING`, [businessId, plan.id, String(TRIAL_DAYS)]);
  clearSubCache(businessId);
  const full = await getActiveSubscription(businessId);
  if (!full) throw new BadRequestError('Failed to create trial subscription');
  return full;
}

export async function createTrialSubscription(
  businessId: string,
  planSlug = 'starter'
): Promise<SubscriptionWithPlan> {
  const existing = await getActiveSubscription(businessId);
  if (existing) return existing;

  let plan: Plan;
  try {
    plan = await getPlanBySlug(planSlug);
  } catch {
    plan = await getPlanBySlug('starter');
  }

  const days = TRIAL_DAYS;
  const dupeGuardWindowMs = 2 * 60 * 1000;
  try {
    const dupe = await query<{ id: string }>(
      `SELECT id FROM subscriptions
        WHERE business_id = $1 AND status = 'trialing'
          AND created_at > NOW() - make_interval(secs => $2)
        ORDER BY created_at DESC LIMIT 1`,
      [businessId, dupeGuardWindowMs / 1000]
    );
    if (dupe.rows[0]) {
      const reread = await getActiveSubscription(businessId);
      if (reread) return reread;
    }
    await query(
      `INSERT INTO subscriptions
         (business_id, plan_id, status,
          current_period_start, current_period_end,
          trial_ends_at, metadata)
       VALUES (
         $1, $2, 'trialing',
         NOW(), NOW() + make_interval(days => $3),
         NOW() + make_interval(days => $3),
         '{"source":"public-signup"}'::jsonb
       )
       ON CONFLICT DO NOTHING`,
      [businessId, plan.id, days]
    );
  } catch (err: any) {
    logger.warn('Trial insert skipped/guarded', { businessId, err: err?.message });
  }
  invalidateSubscriptionCache(businessId);

  const created = await getActiveSubscription(businessId);
  if (!created) throw new BadRequestError('Failed to create trial subscription');
  return created;
}

/** Change plan on an existing subscription (append-only plan catalog: never edit plan rows). */

export async function changePlan(businessId: string, slug: string, by?: string): Promise<SubscriptionWithPlan> {
  const cur = await getActiveSubscription(businessId);
  if (!cur) throw new NotFoundError('No active subscription');
  const next = await getPlanBySlug(slug);
  if (!next.is_active) throw new BadRequestError(`Plan '${slug}' unavailable`);
  const from = (cur.plan as Plan).slug;
  await query(`UPDATE subscriptions SET plan_id=$1, updated_at=NOW(), metadata=metadata||$2::jsonb WHERE id=$3`, [next.id, JSON.stringify({ from, at: new Date().toISOString(), by: by || null }), cur.id]);
  clearSubCache(businessId);
  logger.info('Plan changed', { businessId, from, to: slug });
  const u = await getActiveSubscription(businessId);
  if (!u) throw new NotFoundError('Subscription missing after change');
  return u;
}

export async function changeSubscriptionPlan(b: string, s: string): Promise<SubscriptionWithPlan> { return changePlan(b, s); }

export async function cancelSub(businessId: string): Promise<Subscription> {
  const cur = await getActiveSubscription(businessId);
  if (!cur) throw new NotFoundError('No active subscription to cancel');
  const r = await query<Subscription>(`UPDATE subscriptions SET status='canceled', canceled_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING id,business_id,plan_id,status,current_period_start,current_period_end,trial_ends_at,canceled_at,grace_period_ends_at,external_customer_id,external_subscription_id,metadata,created_at,updated_at`, [cur.id]);
  clearSubCache(businessId);
  return r.rows[0] as Subscription;
}

export async function cancelSubscription(b: string): Promise<Subscription> { return cancelSub(b); }

export async function expireDueTrials(): Promise<number> {
  const r = await query<{ id: string }>(`UPDATE subscriptions SET status='expired', grace_period_ends_at=NOW()+($1||' days')::interval, updated_at=NOW() WHERE status='trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at<=NOW() RETURNING id`, [String(GRACE_PERIOD_DAYS)]);
  return r.rowCount || 0;
}

function monthBounds(now = new Date()): { s: string; e: string } {
  const a = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const b = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { s: a.toISOString().slice(0, 10), e: b.toISOString().slice(0, 10) };
}

export async function getUsage(businessId: string, metric: string): Promise<UsageRecord | null> {
  const { s, e } = monthBounds();
  return getCached(`usage:${businessId}:${metric}:${s}`, async () => {
    const r = await query<UsageRecord>(`SELECT id,business_id,subscription_id,metric,used,limit_value,period_start,period_end,metadata,created_at,updated_at FROM usage_records WHERE business_id=$1 AND metric=$2 AND period_start=$3 AND period_end=$4 LIMIT 1`, [businessId, metric, s, e]);
    return r.rows[0] || null;
  }, USAGE_CACHE_TTL_SECONDS);
}

export async function incrementUsage(businessId: string, metric: string, amount = 1): Promise<UsageRecord> {
  const sub = await getActiveSubscription(businessId);
  const limit = sub ? getPlanLimit(sub.plan as Plan, metric) : undefined;
  const { s, e } = monthBounds();
  const r = await query<UsageRecord>(`INSERT INTO usage_records (business_id,subscription_id,metric,used,limit_value,period_start,period_end) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (business_id,metric,period_start) DO UPDATE SET used=usage_records.used+EXCLUDED.used, limit_value=EXCLUDED.limit_value, subscription_id=EXCLUDED.subscription_id, updated_at=NOW() RETURNING id,business_id,subscription_id,metric,used,limit_value,period_start,period_end,metadata,created_at,updated_at`, [businessId, sub?.id || null, metric, amount, limit ?? null, s, e]);
  invalidateCache(`usage:${businessId}:${metric}:${s}`);
  return r.rows[0] as UsageRecord;
}

export async function requireFeatureLimit(businessId: string, metric: string): Promise<void> {
  if (!isKnownLimitMetric(metric)) return;
  const sub = await getActiveSubscription(businessId);
  if (!sub || !isUsable(sub)) throw new PaymentRequiredError('Active subscription or trial required. Please upgrade.');
  const limit = getPlanLimit(sub.plan as Plan, metric);
  if (limit === undefined || isUnlimited(limit)) return;
  const u = await getUsage(businessId, metric);
  const used = u?.used || 0;
  if (used >= limit) throw new PaymentRequiredError(`Monthly quota for ${metric} reached (${used}/${limit}). Please upgrade.`);
}

export async function requireStaffSeat(businessId: string): Promise<void> {
  const sub = await getActiveSubscription(businessId);
  if (!sub || !isUsable(sub)) throw new PaymentRequiredError('Active subscription or trial required to add staff.');
  const limit = getPlanLimit(sub.plan as Plan, 'staff_users');
  if (limit === undefined || isUnlimited(limit)) return;
  const c = await query<{ total: string }>(`SELECT COUNT(*) AS total FROM staff_users WHERE business_id=$1 AND status='active'`, [businessId]);
  const used = parseInt(c.rows[0]?.total || '0', 10);
  if (used >= limit) throw new PaymentRequiredError(`Staff seats full (${used}/${limit}). Please upgrade.`);
}

export async function requireStaffSeatAvailable(b: string): Promise<void> { return requireStaffSeat(b); }


export function isSubscriptionUsable(s: SubscriptionWithPlan | null): boolean { return isUsable(s); }
export function trialDaysRemaining(s: SubscriptionWithPlan | null): number | null { return trialDaysLeft(s); }
export function invalidateSubscriptionCache(b: string): void { clearSubCache(b); }
export function assertSubscriptionUsable(s: SubscriptionWithPlan | null): void { assertUsable(s); }
export async function getSubscriptionHistory(b: string): Promise<SubscriptionWithPlan[]> { return getHistory(b); }

