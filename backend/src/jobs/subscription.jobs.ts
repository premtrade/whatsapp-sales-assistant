import { query } from '../utils/database';
import logger from '../utils/logger';

/**
 * Trial lifecycle jobs (ops workflow: trial expiration handling).
 * In-process scheduler started from server.ts. Each job is idempotent and
 * safe to run repeatedly; SQL filters make re-runs no-ops.
 */

const HOUR_MS = 60 * 60 * 1000;
let timers: NodeJS.Timeout[] = [];

/** Mark elapsed trials as trial_expired. Blocks access once the
 *  trial_expiry_enforcement flag is on for the tenant. */
export async function expireOverdueTrials(): Promise<number> {
  const result = await query(
    `UPDATE subscriptions
        SET status = 'trial_expired', updated_at = NOW()
      WHERE status = 'trialing'
        AND trial_end_at IS NOT NULL
        AND trial_end_at <= NOW()`
  );
  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info('trialSweep: expired overdue trials', { count });
  }
  return count;
}

/** Snapshot of trial funnel metrics for ops dashboards / daily report. */
export async function getTrialReport(): Promise<{
  trialing: number;
  expiringIn3Days: number;
  expiringIn7Days: number;
  expiredLast7Days: number;
  convertedLast7Days: number;
}> {
  const result = await query<{
    trialing: string;
    expiring_3: string;
    expiring_7: string;
    expired_7: string;
    converted_7: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'trialing')::text AS trialing,
       COUNT(*) FILTER (WHERE status = 'trialing' AND trial_end_at BETWEEN NOW() AND NOW() + INTERVAL '3 days')::text AS expiring_3,
       COUNT(*) FILTER (WHERE status = 'trialing' AND trial_end_at BETWEEN NOW() AND NOW() + INTERVAL '7 days')::text AS expiring_7,
       COUNT(*) FILTER (WHERE status = 'trial_expired' AND updated_at >= NOW() - INTERVAL '7 days')::text AS expired_7,
       COUNT(*) FILTER (WHERE status = 'active' AND converted_at >= NOW() - INTERVAL '7 days')::text AS converted_7
     FROM subscriptions`
  );
  const row = result.rows[0];
  return {
    trialing: Number(row?.trialing ?? 0),
    expiringIn3Days: Number(row?.expiring_3 ?? 0),
    expiringIn7Days: Number(row?.expiring_7 ?? 0),
    expiredLast7Days: Number(row?.expired_7 ?? 0),
    convertedLast7Days: Number(row?.converted_7 ?? 0),
  };
}

/**
 * TODO(beta ops): send reminder emails at T-7 / T-3 / T-1 days before
 * trial_end_at. Blocked on SMTP integration — once wired, select tenants via
 *   SELECT ... FROM subscriptions WHERE status='trialing'
 *     AND trial_end_at - NOW() < INTERVAL '7 days'
 *     AND metadata->>'reminder_7d_sent' IS NULL
 * then stamp metadata so each reminder fires exactly once.
 */

export function startSubscriptionJobs(): void {
  // Run once shortly after boot, then hourly.
  setTimeout(() => {
    expireOverdueTrials().catch((error) => logger.error('trialSweep failed', { error }));
  }, 10_000);

  timers.push(
    setInterval(() => {
      expireOverdueTrials().catch((error) => logger.error('trialSweep failed', { error }));
    }, HOUR_MS)
  );

  logger.info('subscription jobs started', { intervalMinutes: 60 });
}

export function stopSubscriptionJobs(): void {
  timers.forEach((t) => clearInterval(t));
  timers = [];
}
