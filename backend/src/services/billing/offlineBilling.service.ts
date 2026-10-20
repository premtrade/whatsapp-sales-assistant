import { query } from '../../utils/database';
import logger from '../../utils/logger';
import { config } from '../../config';
import { clearSubCache, GRACE_PERIOD_DAYS } from '../subscription.service';
import { createPaymentRequest, listPaymentRequests } from './paymentRequests.service';
import { applyScheduledCancellations } from './cancellation.service';
import { getPaymentProvider } from './index';
import { emailService } from '../email.service';

/**
 * Lifecycle for offline (bank transfer) billing.
 *
 * A card processor tells us when a subscription renews. Offline billing has to
 * manage that itself, otherwise a customer pays once and keeps access
 * forever. Three things have to happen without human involvement:
 *
 *   1. Before the paid period ends, raise a payment request for the renewal
 *      so the customer has time to pay.
 *   2. When the period ends unpaid, move the subscription to `past_due` and
 *      open a grace period — a bank transfer can legitimately be in flight,
 *      so the customer is not cut off the moment the period rolls over.
 *   3. When the grace period ends unpaid, expire the subscription.
 *
 * Only subscriptions billed offline are touched. Stripe subscriptions are
 * driven by the processor's own webhooks and are deliberately excluded.
 */

const OFFLINE = 'manual';

export interface OfflineLifecycleResult {
  renewalsCreated: number;
  markedPastDue: number;
  expired: number;
}

function offlineBillingActive(): boolean {
  try {
    return getPaymentProvider().id === OFFLINE;
  } catch (error) {
    logger.warn('Offline billing lifecycle skipped because no provider is configured', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

type RenewalCandidate = {
  id: string;
  business_id: string;
  business_name: string;
  email: string | null;
  plan_slug: string;
  plan_name: string;
  price_monthly: string;
  currency: string;
  current_period_end: Date;
};

/** The admin or manager who should receive billing mail, else the business email. */
const CONTACT_EMAIL_SQL = `
  COALESCE(
    (SELECT su.email FROM staff_users su
      WHERE su.business_id = s.business_id AND su.status = 'active'
        AND su.deleted_at IS NULL
        AND su.role IN ('admin','manager') AND su.email IS NOT NULL
      ORDER BY (su.role = 'admin') DESC, su.created_at ASC LIMIT 1),
    b.email
  )`;

export async function createRenewalRequests(): Promise<number> {
  const windowDays = config.billing.renewalWindowDays;

  const candidates = await query<RenewalCandidate>(
    `SELECT s.id, s.business_id, b.name AS business_name,
            ${CONTACT_EMAIL_SQL} AS email,
            p.slug AS plan_slug, p.name AS plan_name,
            p.price_monthly, p.currency, s.current_period_end
       FROM subscriptions s
       JOIN businesses b ON b.id = s.business_id
       JOIN plans p ON p.id = s.plan_id
      WHERE s.status IN ('active','past_due')
        AND s.metadata->>'provider' = $1
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end <= NOW() + make_interval(days => $2)
        AND NOT EXISTS (
          SELECT 1 FROM payment_requests pr
           WHERE pr.business_id = s.business_id AND pr.status = 'pending'
        )
      LIMIT 500`,
    [OFFLINE, String(windowDays)]
  );

  if (candidates.rows.length === 0) return 0;

  // Reuse the pending-request list so we do not create a second request for a
  // business that already has one outstanding.
  const pending = await listPaymentRequests({ status: 'pending' });
  const pendingByBusiness = new Set(pending.map((r) => r.business_id));

  let created = 0;
  for (const candidate of candidates.rows) {
    if (pendingByBusiness.has(candidate.business_id)) continue;

    try {
      const request = await createPaymentRequest({
        businessId: candidate.business_id,
        planSlug: candidate.plan_slug,
      });
      created += 1;
      logger.info('Offline renewal payment request created', {
        businessId: candidate.business_id,
        reference: request.reference,
        plan: candidate.plan_slug,
        periodEnd: candidate.current_period_end,
      });

      if (candidate.email) {
        try {
          await emailService.sendPaymentRequest(candidate.email, candidate.business_name, {
            reference: request.reference,
            amount: Number(candidate.price_monthly),
            currency: candidate.currency,
            planName: candidate.plan_name,
            periodEnd: candidate.current_period_end,
            isRenewal: true,
          });
        } catch (error) {
          logger.warn('Renewal payment request email not delivered', {
            businessId: candidate.business_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      logger.error('Failed to create renewal payment request', {
        businessId: candidate.business_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return created;
}

export async function markUnpaidPeriodsPastDue(): Promise<number> {
  const result = await query<{ id: string; business_id: string }>(
    `UPDATE subscriptions
        SET status='past_due',
            grace_period_ends_at=NOW() + make_interval(days => $1),
            updated_at=NOW()
      WHERE status='active'
        AND metadata->>'provider' = $2
        AND current_period_end IS NOT NULL
        AND current_period_end <= NOW()
      RETURNING id, business_id`,
    [String(GRACE_PERIOD_DAYS), OFFLINE]
  );

  for (const row of result.rows) {
    clearSubCache(row.business_id);
  }
  return result.rowCount || 0;
}

export async function expireUnpaidSubscriptions(): Promise<number> {
  const result = await query<{ id: string; business_id: string }>(
    `UPDATE subscriptions
        SET status='expired',
            updated_at=NOW()
      WHERE status='past_due'
        AND metadata->>'provider' = $1
        AND grace_period_ends_at IS NOT NULL
        AND grace_period_ends_at <= NOW()
      RETURNING id, business_id`,
    [OFFLINE]
  );

  for (const row of result.rows) {
    clearSubCache(row.business_id);
  }
  return result.rowCount || 0;
}

/** Runs the full offline billing lifecycle. Safe to call hourly. */
export async function runOfflineBillingLifecycle(): Promise<OfflineLifecycleResult> {
  const empty = { renewalsCreated: 0, markedPastDue: 0, expired: 0 };
  if (!offlineBillingActive()) return empty;

  try {
    const renewalsCreated = await createRenewalRequests();
    const canceled = await applyScheduledCancellations();
    const markedPastDue = await markUnpaidPeriodsPastDue();
    const expired = await expireUnpaidSubscriptions();

    if (renewalsCreated || markedPastDue || expired || canceled) {
      logger.info('Offline billing lifecycle completed', {
        renewalsCreated,
        markedPastDue,
        expired,
        canceled,
      });
    }

    return { renewalsCreated, markedPastDue, expired };
  } catch (error) {
    logger.error('Offline billing lifecycle failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return empty;
  }
}
