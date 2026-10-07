import { query } from '../utils/database';
import { ForbiddenError, AppError } from '../utils/errors';
import { isFeatureEnabledForBusiness } from './featureFlag.service';

/**
 * Items 1 & 2 — Entitlement engine.
 * Resolves a business's subscription + entitlements + usage, and enforces
 * trial expiry and quota limits. All middleware/services go through this file
 * so enforcement logic lives in exactly one place.
 */

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'trial_expired'
  | 'suspended'
  | 'cancelled';

export interface SubscriptionState {
  subscriptionId: string;
  businessId: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  trialStartAt: Date | null;
  trialEndAt: Date | null;
  currentPeriodStart: Date;
  aiResponsesLimit: number | null; // null = unlimited
  maxStaffUsers: number | null;
  maxLocations: number | null;
  features: Record<string, unknown>;
}

const stateCache = new Map<string, { state: SubscriptionState; loadedAt: number }>();
const STATE_CACHE_TTL_MS = 30_000;

export async function getSubscriptionState(businessId: string): Promise<SubscriptionState | null> {
  const cached = stateCache.get(businessId);
  if (cached && Date.now() - cached.loadedAt < STATE_CACHE_TTL_MS) {
    return cached.state;
  }

  const result = await query<{
    subscription_id: string;
    business_id: string;
    plan_code: string;
    plan_name: string;
    status: SubscriptionStatus;
    trial_start_at: Date | null;
    trial_end_at: Date | null;
    current_period_start: Date;
    ai_responses_per_period: number | null;
    max_staff_users: number | null;
    max_locations: number | null;
    features: Record<string, unknown>;
  }>(
    `SELECT s.id AS subscription_id,
            s.business_id,
            p.code AS plan_code,
            p.name AS plan_name,
            s.status,
            s.trial_start_at,
            s.trial_end_at,
            s.current_period_start,
            COALESCE(e.ai_responses_per_period, p.ai_responses_per_period) AS ai_responses_per_period,
            COALESCE(e.max_staff_users, p.max_staff_users)                 AS max_staff_users,
            COALESCE(e.max_locations, p.max_locations)                     AS max_locations,
            e.features
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
  LEFT JOIN entitlements e ON e.subscription_id = s.id
      WHERE s.business_id = $1 AND s.status <> 'cancelled'
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [businessId]
  );

  const row = result.rows[0];
  if (!row) {
    stateCache.delete(businessId);
    return null;
  }

  const state: SubscriptionState = {
    subscriptionId: row.subscription_id,
    businessId: row.business_id,
    planCode: row.plan_code,
    planName: row.plan_name,
    status: row.status,
    trialStartAt: row.trial_start_at,
    trialEndAt: row.trial_end_at,
    currentPeriodStart: row.current_period_start,
    aiResponsesLimit: row.ai_responses_per_period,
    maxStaffUsers: row.max_staff_users,
    maxLocations: row.max_locations,
    features: row.features ?? {},
  };

  stateCache.set(businessId, { state, loadedAt: Date.now() });
  return state;
}

export function invalidateSubscriptionCache(businessId: string): void {
  stateCache.delete(businessId);
}

/** True when the trial window has elapsed. */
export function isTrialOver(state: SubscriptionState, now = new Date()): boolean {
  if (state.status !== 'trialing') return false;
  return !!state.trialEndAt && state.trialEndAt.getTime() <= now.getTime();
}

/**
 * Access gate called by requireEntitlement middleware.
 * Throws typed errors so clients can render TRIAL_EXPIRED / SUSPENDED screens.
 */
export async function assertAccessAllowed(businessId: string): Promise<SubscriptionState> {
  const state = await getSubscriptionState(businessId);

  if (!state) {
    throw new ForbiddenError('No active subscription for this workspace', 'NO_SUBSCRIPTION');
  }

  if (state.status === 'suspended' || state.status === 'cancelled') {
    throw new ForbiddenError(
      `Account is ${state.status}. Contact support to restore access.`,
      state.status.toUpperCase()
    );
  }

  if (isTrialOver(state)) {
    // Persist the transition once (feeds the trial-expiry ops report).
    if (state.status === 'trialing') {
      await query(
        `UPDATE subscriptions SET status = 'trial_expired', updated_at = NOW()
         WHERE id = $1 AND status = 'trialing'`,
        [state.subscriptionId]
      );
      invalidateSubscriptionCache(businessId);
    }
    // Kill-switch: only hard-block when enforcement flag is on for this tenant.
    const enforce = await isFeatureEnabledForBusiness('trial_expiry_enforcement', businessId);
    if (enforce) {
      throw new AppError(
        'Your free trial has ended. Upgrade to continue using WAFLO.',
        403,
        'TRIAL_EXPIRED'
      );
    }
  }

  return state;
}

// ----------------------------------------------------------
// Usage metering & quota enforcement
// ----------------------------------------------------------

export async function getUsage(subscriptionId: string, metric: string): Promise<number> {
  const result = await query<{ quantity: string }>(
    `SELECT quantity FROM usage_counters
      WHERE subscription_id = $1 AND metric = $2
      ORDER BY period_start DESC LIMIT 1`,
    [subscriptionId, metric]
  );
  return result.rows[0] ? Number(result.rows[0].quantity) : 0;
}

/** Current billing period start (month-aligned) for a subscription. */
export function currentPeriodStart(state: SubscriptionState, now = new Date()): Date {
  const anchor = state.currentPeriodStart ?? now;
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
}

/** Atomically increments the counter for the current period. */
export async function incrementUsage(
  subscriptionId: string,
  metric: string,
  periodStart: Date,
  amount = 1
): Promise<void> {
  await query(
    `INSERT INTO usage_counters (subscription_id, metric, period_start, quantity, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (subscription_id, metric, period_start)
     DO UPDATE SET quantity = usage_counters.quantity + $4, updated_at = NOW()`,
    [subscriptionId, metric, periodStart, amount]
  );
}

/**
 * Single entry point for EVERY AI-generated WhatsApp reply (backend sends and
 * n8n workflow callbacks). Enforces, in order:
 *   1. subscription access (trial expiry / suspension) — 403 TRIAL_EXPIRED
 *   2. ai_outreach_enabled kill-switch               — 403 AI_OUTREACH_DISABLED
 *   3. monthly quota                                 — 402 QUOTA_EXCEEDED
 * Returns the resolved state; callers must then persist the message with
 * sender_type='ai' and call recordAiResponse() exactly once per wamid.
 */
export async function assertAiQuotaAvailable(businessId: string): Promise<SubscriptionState> {
  const state = await assertAccessAllowed(businessId);

  // Kill-switch: hard stop all AI sends during a beta incident.
  const outreachEnabled = await isFeatureEnabledForBusiness('ai_outreach_enabled', businessId);
  if (!outreachEnabled) {
    throw new AppError(
      'AI replies are temporarily disabled for this workspace.',
      403,
      'AI_OUTREACH_DISABLED'
    );
  }

  if (state.aiResponsesLimit === null) return state; // unlimited plan

  const enforce = await isFeatureEnabledForBusiness('ai_quota_enforcement', businessId);
  if (!enforce) return state;

  const used = await getUsage(state.subscriptionId, 'ai_responses');
  if (used >= state.aiResponsesLimit) {
    throw new AppError(
      `AI response quota (${state.aiResponsesLimit}/period) exhausted on the ${state.planName} plan. Upgrade to continue.`,
      402,
      'QUOTA_EXCEEDED'
    );
  }
  return state;
}

/**
 * Records one metered AI response. Deduplicated by whatsapp_message_id so
 * webhook retries / duplicate WAHA events never double-count usage.
 */
export async function recordAiResponse(
  businessId: string,
  dedupeKey?: string | null
): Promise<void> {
  const state = await getSubscriptionState(businessId);
  if (!state) return;

  if (dedupeKey) {
    const seen = await query<{ id: string }>(
      `SELECT 1 AS id FROM usage_counter_events
        WHERE subscription_id = $1 AND metric = $2 AND dedupe_key = $3
        LIMIT 1`,
      [state.subscriptionId, 'ai_responses', dedupeKey]
    );
    if (seen.rowCount && seen.rowCount > 0) return; // already counted
  }

  await incrementUsage(state.subscriptionId, 'ai_responses', currentPeriodStart(state));

  if (dedupeKey) {
    await query(
      `INSERT INTO usage_counter_events (subscription_id, metric, dedupe_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (subscription_id, metric, dedupe_key) DO NOTHING`,
      [state.subscriptionId, 'ai_responses', dedupeKey]
    );
  }
}

// ----------------------------------------------------------
// Seat limit enforcement (user access controls)
// ----------------------------------------------------------

export async function assertSeatAvailable(businessId: string): Promise<void> {
  const state = await getSubscriptionState(businessId);
  if (!state || state.maxStaffUsers === null) return; // unlimited

  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM staff_users
      WHERE business_id = $1 AND status = 'active'`,
    [businessId]
  );
  const seatsUsed = Number(result.rows[0]?.count ?? 0);
  if (seatsUsed >= state.maxStaffUsers) {
    throw new AppError(
      `Seat limit (${state.maxStaffUsers}) reached on the ${state.planName} plan. Remove a user or upgrade.`,
      403,
      'SEAT_LIMIT_REACHED'
    );
  }
}
