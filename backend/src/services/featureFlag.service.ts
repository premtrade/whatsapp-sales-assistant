import { query } from '../utils/database';
import logger from '../utils/logger';

/**
 * Item 4 — Feature flags & beta kill-switches.
 * DB-driven (feature_flags table, migration 049) with a short in-memory
 * cache so ops can flip switches without a deploy and requests stay fast.
 */

export type FeatureFlagKey =
  | 'public_beta_enabled'
  | 'signup_open'
  | 'trial_expiry_enforcement'
  | 'ai_quota_enforcement'
  | string;

interface FlagRow {
  key: string;
  enabled: boolean;
  rollout_percent: number;
  allowed_business_ids: string[];
}

const CACHE_TTL_MS = 15_000;
let cache: Map<string, FlagRow> | null = null;
let cacheLoadedAt = 0;

async function loadFlags(): Promise<Map<string, FlagRow>> {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cache;
  }
  try {
    const result = await query<FlagRow>(
      'SELECT key, enabled, rollout_percent, allowed_business_ids FROM feature_flags'
    );
    cache = new Map(result.rows.map((row) => [row.key, row]));
    cacheLoadedAt = now;
  } catch (error) {
    // Table may not exist yet (migration pending) — fail closed for beta gates,
    // but never crash the request path.
    logger.warn('featureFlags: failed to load flags, using last-known/empty set', { error });
    if (!cache) cache = new Map();
  }
  return cache;
}

/** Raw enabled check (ignores rollout/allowlist). */
export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const flags = await loadFlags();
  const flag = flags.get(key);
  return flag ? flag.enabled : false;
}

/**
 * Per-tenant check: allowlisted businesses always pass; otherwise the
 * business deterministically falls inside rollout_percent (hash bucketing),
 * enabling staged beta rollouts (e.g. 25% of tenants).
 */
export async function isFeatureEnabledForBusiness(
  key: FeatureFlagKey,
  businessId?: string | null
): Promise<boolean> {
  const flags = await loadFlags();
  const flag = flags.get(key);
  if (!flag || !flag.enabled) return false;
  if (!businessId) return flag.rollout_percent === 100;
  if (flag.allowed_business_ids?.includes(businessId)) return true;
  if (flag.rollout_percent >= 100) return true;
  if (flag.rollout_percent <= 0) return false;
  // Deterministic bucket from last 4 hex chars of the business UUID.
  const bucket = parseInt(businessId.replace(/-/g, '').slice(-4), 16) % 100;
  return bucket < flag.rollout_percent;
}

/** Admin/ops helper to flip a flag without SQL access. */
export async function setFeatureFlag(
  key: string,
  enabled: boolean,
  updatedBy?: string
): Promise<void> {
  await query(
    `INSERT INTO feature_flags (key, enabled, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, enabled, updatedBy ?? null]
  );
  cache = null; // force reload on next read
  logger.info('featureFlag updated', { key, enabled, updatedBy });
}
