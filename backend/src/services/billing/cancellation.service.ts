import { query } from '../../utils/database';
import logger from '../../utils/logger';
import { clearSubCache } from '../subscription.service';
import { getPaymentProvider } from './index';
import type { SubscriptionWithPlan } from '../../types';

/**
 * Self-service cancellation.
 *
 * The customer keeps access until the period they have already paid for ends,
 * which is what "cancel any time" is supposed to mean. The intent is recorded
 * on the subscription row so it survives even when there is no provider to
 * schedule a cancellation with, then applied by the billing lifecycle.
 */

export async function scheduleCancellation(businessId: string): Promise<SubscriptionWithPlan | null> {
  const result = await query<SubscriptionWithPlan>(
    `UPDATE subscriptions
        SET cancel_at_period_end = current_period_end,
            metadata = metadata || jsonb_build_object('cancelRequestedAt', NOW()),
            updated_at = NOW()
      WHERE business_id = $1
        AND status IN ('active','trialing','past_due')
        AND cancel_at_period_end IS NULL
      RETURNING *`,
    [businessId]
  );

  const subscription = result.rows[0];
  if (!subscription) {
    throw new Error('There is no subscription to cancel.');
  }

  // Ask the provider as well, so both sides agree.
  if (subscription.external_subscription_id) {
    const provider = getPaymentProvider();
    if (provider.cancelAtPeriodEnd) {
      try {
        await provider.cancelAtPeriodEnd(subscription.external_subscription_id);
      } catch (error) {
        logger.warn('Provider could not schedule the cancellation', {
          businessId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  clearSubCache(businessId);
  logger.info('Subscription cancellation scheduled', {
    businessId,
    cancelAt: subscription.cancel_at_period_end,
  });

  return subscription;
}

export async function clearScheduledCancellation(businessId: string): Promise<SubscriptionWithPlan | null> {
  const result = await query<SubscriptionWithPlan>(
    `UPDATE subscriptions
        SET cancel_at_period_end = NULL,
            metadata = metadata - 'cancelRequestedAt',
            updated_at = NOW()
      WHERE business_id = $1
        AND cancel_at_period_end IS NOT NULL
      RETURNING *`,
    [businessId]
  );

  const subscription = result.rows[0];
  if (!subscription) {
    throw new Error('There is no scheduled cancellation to undo.');
  }

  if (subscription.external_subscription_id) {
    const provider = getPaymentProvider();
    try {
      await provider.resumeSubscription(subscription.external_subscription_id);
    } catch (error) {
      logger.warn('Provider could not resume the subscription', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  clearSubCache(businessId);
  logger.info('Scheduled subscription cancellation cleared', { businessId });

  return subscription;
}

/**
 * Applies cancellations whose paid period has now ended. Runs on the same
 * schedule as the rest of the billing lifecycle.
 */
export async function applyScheduledCancellations(): Promise<number> {
  const result = await query<{ id: string; business_id: string }>(
    `UPDATE subscriptions
        SET status='canceled',
            canceled_at=NOW(),
            updated_at=NOW()
      WHERE cancel_at_period_end IS NOT NULL
        AND cancel_at_period_end <= NOW()
        AND status IN ('active','trialing','past_due')
      RETURNING id, business_id`,
    []
  );

  for (const row of result.rows) {
    clearSubCache(row.business_id);
  }
  return result.rowCount || 0;
}
