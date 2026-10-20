import { query } from '../../utils/database';
import logger from '../../utils/logger';
import { clearSubCache, getPlanBySlug, GRACE_PERIOD_DAYS } from '../subscription.service';
import type { SubscriptionStatus } from '../../types';
import type { BillingEvent } from './types';

/**
 * The single writer of subscription state.
 *
 * Payment providers differ in how they report a charge, a failure or a
 * cancellation. They do not differ in what those mean for the tenant: the
 * subscription becomes active, the ledger records the payment, the grace
 * period opens. All of that lives here so every provider behaves identically.
 */

type LocalSubscription = { id: string; business_id: string; status: string };

async function findSubscription(
  businessId?: string,
  providerCustomerId?: string,
  providerSubscriptionId?: string,
): Promise<LocalSubscription | null> {
  if (businessId) {
    const byBusiness = await query<LocalSubscription>(
      `SELECT id, business_id, status FROM subscriptions
        WHERE business_id = $1 AND status IN ('trialing','active','past_due','expired','canceled')
        ORDER BY created_at DESC LIMIT 1`,
      [businessId]
    );
    if (byBusiness.rows[0]) return byBusiness.rows[0];
  }

  if (providerCustomerId || providerSubscriptionId) {
    const byExternal = await query<LocalSubscription>(
      `SELECT id, business_id, status FROM subscriptions
        WHERE ($1::text IS NOT NULL AND external_customer_id = $1)
           OR ($2::text IS NOT NULL AND external_subscription_id = $2)
        ORDER BY created_at DESC LIMIT 1`,
      [providerCustomerId ?? null, providerSubscriptionId ?? null]
    );
    if (byExternal.rows[0]) return byExternal.rows[0];
  }

  return null;
}

async function activateSubscription(event: Extract<BillingEvent, { type: 'subscription.activated' }>): Promise<void> {
  const target = await findSubscription(
    event.businessId,
    event.providerCustomerId,
    event.providerSubscriptionId
  );
  if (!target) {
    logger.warn('subscription.activated matched no local subscription', {
      businessId: event.businessId,
      providerSubscriptionId: event.providerSubscriptionId,
    });
    return;
  }

  const planId = event.planSlug
    ? await getPlanBySlug(event.planSlug).then((p) => p.id).catch(() => null)
    : null;

  await query(
    `UPDATE subscriptions
        SET status='active',
            plan_id=COALESCE($1, plan_id),
            external_subscription_id=COALESCE($2, external_subscription_id),
            external_customer_id=COALESCE($3, external_customer_id),
            metadata=metadata||$4::jsonb
                   ||CASE WHEN status <> 'active' THEN jsonb_build_object('converted_at', NOW()) ELSE '{}'::jsonb END,
            updated_at=NOW()
      WHERE id=$5`,
    [
      planId,
      event.providerSubscriptionId ?? null,
      event.providerCustomerId ?? null,
      JSON.stringify({ ...(event.metadata || {}), provider: event.provider }),
      target.id,
    ]
  );

  clearSubCache(target.business_id);
  logger.info('Subscription activated', { businessId: target.business_id, provider: event.provider });
}

async function changeSubscriptionStatus(
  event: Extract<BillingEvent, { type: 'subscription.status_changed' }>
): Promise<void> {
  const target = await findSubscription(
    event.businessId,
    event.providerCustomerId,
    event.providerSubscriptionId
  );
  if (!target) {
    logger.warn('subscription.status_changed matched no local subscription', {
      businessId: event.businessId,
      providerSubscriptionId: event.providerSubscriptionId,
    });
    return;
  }

  await query(
    `UPDATE subscriptions
        SET status=$1,
            external_subscription_id=COALESCE($2, external_subscription_id),
            metadata=metadata||$3::jsonb
                   ||CASE WHEN $1='active' AND status <> 'active'
                          THEN jsonb_build_object('converted_at', NOW()) ELSE '{}'::jsonb END,
            updated_at=NOW()
      WHERE id=$4`,
    [
      event.status,
      event.providerSubscriptionId ?? null,
      JSON.stringify({
        ...(event.metadata || {}),
        provider: event.provider,
        ...(event.reason ? { reason: event.reason } : {}),
      }),
      target.id,
    ]
  );

  clearSubCache(target.business_id);
  logger.info('Subscription status changed', {
    businessId: target.business_id,
    status: event.status,
    provider: event.provider,
  });
}

async function recordSuccessfulPayment(
  event: Extract<BillingEvent, { type: 'payment.succeeded' }>
): Promise<void> {
  const target = await findSubscription(
    event.businessId,
    event.providerCustomerId,
    event.providerSubscriptionId
  );

  const businessId = target?.business_id ?? event.businessId;

  // `idempotency_key` is the unique column on `payments`; `provider_payment_id`
  // only carries a plain index, so it cannot be used as an ON CONFLICT target.
  await query(
    `INSERT INTO payments
       (business_id, subscription_id, amount, currency, status, provider,
        provider_payment_id, provider_customer_id, paid_at, metadata, idempotency_key)
     VALUES ($1,$2,$3,$4,'succeeded',$5,$6,$7,NOW(),$8::jsonb,$9)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      businessId,
      target?.id ?? null,
      event.amount,
      event.currency.toUpperCase(),
      event.provider,
      event.providerPaymentId,
      event.providerCustomerId ?? null,
      JSON.stringify({ ...(event.metadata || {}), provider: event.provider }),
      `${event.provider}:${event.providerPaymentId}`,
    ]
  );

  // A successful payment clears a past-due state.
  if (target && target.status === 'past_due') {
    await query(
      `UPDATE subscriptions
          SET status='active',
              metadata=metadata||jsonb_build_object('lastPaymentResolvedAt', NOW(), 'provider', $2::text),
              updated_at=NOW()
        WHERE id=$1`,
      [target.id, event.provider]
    );
    clearSubCache(target.business_id);
  }
}

async function recordFailedPayment(event: Extract<BillingEvent, { type: 'payment.failed' }>): Promise<void> {
  const target = await findSubscription(
    event.businessId,
    event.providerCustomerId,
    event.providerSubscriptionId
  );
  if (!target) return;

  await query(
    `UPDATE subscriptions
        SET status='past_due',
            grace_period_ends_at=NOW() + make_interval(days => $1),
            metadata=metadata||$2::jsonb,
            updated_at=NOW()
      WHERE id=$3`,
    [
      String(GRACE_PERIOD_DAYS),
      JSON.stringify({
        provider: event.provider,
        ...(event.reason ? { failureReason: event.reason } : {}),
        ...(event.metadata || {}),
      }),
      target.id,
    ]
  );

  clearSubCache(target.business_id);
  logger.warn('Payment failed', { businessId: target.business_id, provider: event.provider });
}

export async function applyBillingEvent(event: BillingEvent): Promise<void> {
  switch (event.type) {
    case 'subscription.activated':
      await activateSubscription(event);
      return;
    case 'subscription.status_changed':
      await changeSubscriptionStatus(event);
      return;
    case 'payment.succeeded':
      await recordSuccessfulPayment(event);
      return;
    case 'payment.failed':
      await recordFailedPayment(event);
      return;
  }
}

/** Maps a provider's subscription status onto the platform's vocabulary. */
export function mapSubscriptionStatus(raw: string): SubscriptionStatus {
  switch (raw) {
    case 'active':
      return 'active';
    // A provider-side trial must not end the platform's own trial early.
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'incomplete_expired':
    case 'expired':
      return 'expired';
    default:
      return 'paused';
  }
}
