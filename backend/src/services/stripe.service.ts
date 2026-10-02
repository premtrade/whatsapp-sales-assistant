import Stripe from 'stripe';
import { query } from '../utils/database';
import { BadRequestError, NotFoundError } from '../utils/errors';
import logger from '../utils/logger';
import { getActiveSubscription, getPlanById, getPlanBySlug, clearSubCache, TRIAL_DAYS, GRACE_PERIOD_DAYS } from './subscription.service';
import type { Plan } from '../types';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new BadRequestError('Stripe is not configured: STRIPE_SECRET_KEY is missing');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secret, {
      apiVersion: '2025-02-24.acacia',
    });
  }
  return stripeClient;
}

export async function createCheckoutSession(businessId: string, planSlug: string, successUrl: string, cancelUrl: string): Promise<{ url: string }> {
  const sub = await getActiveSubscription(businessId);
  if (!sub) throw new NotFoundError('No active subscription');

  const plan = await getPlanBySlug(planSlug);

  const businessResult = await query<{ id: string; name: string; email: string | null }>(
    `SELECT id, name, email FROM businesses WHERE id = $1 LIMIT 1`,
    [businessId]
  );
  const business = businessResult.rows[0];
  if (!business) throw new NotFoundError('Business not found');

  const stripe = getStripe();

  let customerId = sub.external_customer_id || undefined;
  if (!customerId && business.email) {
    const matches = await stripe.customers.list({ email: business.email, limit: 1 });
    const existing = matches.data[0];
    if (existing && existing.metadata?.businessId === businessId) {
      customerId = existing.id;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: business.email,
        name: business.name,
        metadata: { businessId },
      });
      customerId = customer.id;
      await query(`UPDATE subscriptions SET external_customer_id=$1, metadata=metadata||$2::jsonb WHERE id=$3`, [customerId, JSON.stringify({ stripeCustomerId: customerId }), sub.id]);
      clearSubCache(businessId);
    }
  }

  // If the local subscription is still in trial, tell Stripe to extend its trial
  // so that the first invoice is not generated until the local trial expires.
  const trialEndTimestamp = sub.status === 'trialing' && sub.trial_ends_at
    ? Math.max(0, Math.floor(new Date(sub.trial_ends_at).getTime() / 1000))
    : undefined;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    customer_email: customerId ? undefined : business.email || undefined,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: plan.currency.toLowerCase(),
          product_data: {
            name: plan.name,
          },
          unit_amount: Math.round(Number(plan.price_monthly) * 100),
          recurring: {
            interval: 'month',
          },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: trialEndTimestamp ? Math.max(0, Math.ceil((trialEndTimestamp - Math.floor(Date.now() / 1000)) / 86400)) : undefined,
      metadata: {
        businessId,
        subscriptionId: sub.id,
        planSlug,
      },
    },
    metadata: {
      businessId,
      subscriptionId: sub.id,
      planSlug,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  });

  return { url: session.url || '' };
}

export async function createCustomerPortalSession(businessId: string, returnUrl: string): Promise<{ url: string }> {
  const sub = await getActiveSubscription(businessId);
  if (!sub || !sub.external_customer_id) {
    throw new BadRequestError('No Stripe customer found for this subscription');
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.external_customer_id,
    return_url: returnUrl,
  });

  return { url: session.url };
}

export async function cancelStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(stripeSubscriptionId);
}

export async function resumeStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  if (subscription.status === 'canceled' || subscription.cancel_at_period_end) {
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  }
}

export async function handleStripeWebhook(payload: unknown, signature: string): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new BadRequestError('Stripe webhook secret is not configured');
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload as string | Buffer, signature, webhookSecret);
  } catch (err: any) {
    logger.warn('Stripe webhook signature verification failed', { error: err?.message });
    throw new BadRequestError('Invalid webhook signature');
  }

  logger.info('Received Stripe webhook', { type: event.type, id: event.id });

  // Idempotency guard: skip if we have already processed this event.
  try {
    const idempotent = await query<{ id: string }>(
      `INSERT INTO payments (business_id, subscription_id, amount, currency, status, provider, provider_payment_id, provider_customer_id, paid_at, metadata)
       VALUES (
         (SELECT business_id FROM subscriptions WHERE external_customer_id = $1 LIMIT 1),
         NULL, 0, 'USD', 'pending', 'stripe', $2, $1, NOW(), $3::jsonb
       )
       ON CONFLICT (provider_payment_id) DO NOTHING
       RETURNING id`,
      [
        event.data.object && typeof (event.data.object as any).customer === 'string' ? (event.data.object as any).customer : null,
        `stripe_event_${event.id}`,
        JSON.stringify({ stripeEventId: event.id, eventType: event.type, receivedAt: new Date().toISOString() }),
      ]
    );
    // If the row already existed, idempotent.rows.length === 0.
    if (idempotent.rowCount === 0 && event.type !== 'customer.subscription.updated' && event.type !== 'customer.subscription.deleted') {
      // For non-subscription events, skip duplicates.
      logger.info('Skipping duplicate Stripe event', { type: event.type, id: event.id });
      return;
    }
  } catch (err: any) {
    // If the idempotency insert fails for reasons other than conflict, continue processing.
    // This prevents the idempotency mechanism from breaking the webhook flow.
    logger.warn('Stripe webhook idempotency check failed, continuing', { error: err?.message, eventId: event.id });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const businessId = session.metadata?.businessId as string | undefined;
      const subscriptionId = session.metadata?.subscriptionId as string | undefined;
      const planSlug = session.metadata?.planSlug as string | undefined;
      const stripeSubscriptionId = session.subscription as string | undefined;
      const stripeCustomerId = session.customer as string | undefined;

      if (!businessId || !subscriptionId || !stripeSubscriptionId) {
        logger.warn('Stripe checkout.session.completed missing metadata', { sessionId: session.id });
        return;
      }

      const planId = planSlug ? await getPlanBySlug(planSlug).then(p => p.id).catch(() => null) : null;

      await query(
        `UPDATE subscriptions
         SET status='active', plan_id=COALESCE($1, plan_id), external_subscription_id=$2, external_customer_id=$3, metadata=metadata||$4::jsonb, updated_at=NOW()
         WHERE id=$5`,
        [planId, stripeSubscriptionId, stripeCustomerId || null, JSON.stringify({ stripeSessionId: session.id, planSlug, lastEventId: event.id }), subscriptionId]
      );
      clearSubCache(businessId);
      break;
    }

    case 'customer.subscription.created': {
      // Catch the case where Stripe fires subscription.created without a preceding checkout.session.completed.
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const stripeCustomerId = (stripeSubscription.customer as string) || undefined;
      if (!stripeCustomerId) break;

      const subResult = await query<{ id: string; business_id: string }>(
        `SELECT id, business_id FROM subscriptions WHERE external_customer_id=$1 LIMIT 1`,
        [stripeCustomerId]
      );
      const subRow = subResult.rows[0];
      if (!subRow) break;

      await query(
        `UPDATE subscriptions SET external_subscription_id=$1, metadata=metadata||$2::jsonb, updated_at=NOW() WHERE id=$3`,
        [stripeSubscription.id, JSON.stringify({ stripeStatus: stripeSubscription.status, lastEventId: event.id }), subRow.id]
      );
      clearSubCache(subRow.business_id);
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const stripeCustomerId = (stripeSubscription.customer as string) || undefined;

      if (!stripeCustomerId) {
        logger.warn('Stripe subscription event missing customer', { id: stripeSubscription.id });
        return;
      }

      const subResult = await query<{ id: string; business_id: string }>(
        `SELECT id, business_id FROM subscriptions WHERE external_customer_id=$1 OR external_subscription_id=$2 LIMIT 1`,
        [stripeCustomerId, stripeSubscription.id]
      );
      const subRow = subResult.rows[0];
      if (!subRow) {
        logger.warn('Stripe subscription event matched no local subscription', { customerId: stripeCustomerId, subscriptionId: stripeSubscription.id });
        return;
      }

      let status: 'active' | 'past_due' | 'canceled' | 'expired' | 'paused' = 'active';
      if (stripeSubscription.status === 'active') status = 'active';
      else if (stripeSubscription.status === 'past_due') status = 'past_due';
      else if (stripeSubscription.status === 'canceled') status = 'canceled';
      else if (stripeSubscription.status === 'incomplete_expired' || stripeSubscription.status === 'unpaid') status = 'expired';
      else status = 'paused';

      await query(
        `UPDATE subscriptions SET status=$1, external_subscription_id=$2, metadata=metadata||$3::jsonb, updated_at=NOW() WHERE id=$4`,
        [status, stripeSubscription.id, JSON.stringify({ stripeStatus: stripeSubscription.status, lastEventId: event.id }), subRow.id]
      );
      clearSubCache(subRow.business_id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = (invoice.customer as string) || undefined;
      if (!customerId) return;

      const subResult = await query<{ id: string; business_id: string }>(
        `SELECT id, business_id FROM subscriptions WHERE external_customer_id=$1 LIMIT 1`,
        [customerId]
      );
      const subRow = subResult.rows[0];
      if (!subRow) return;

      await query(
        `UPDATE subscriptions SET status='past_due', grace_period_ends_at=NOW() + make_interval(days => $1), metadata=metadata||$2::jsonb, updated_at=NOW() WHERE id=$3`,
        [String(GRACE_PERIOD_DAYS), JSON.stringify({ lastPaymentFailure: invoice.id, failureReason: invoice.last_finalization_error?.message || null, lastEventId: event.id }), subRow.id]
      );
      clearSubCache(subRow.business_id);
      break;
    }

    case 'invoice.payment_succeeded':
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = (invoice.customer as string) || undefined;
      if (!customerId) return;

      const subResult = await query<{ id: string; business_id: string; status: string }>(
        `SELECT id, business_id, status FROM subscriptions WHERE external_customer_id=$1 LIMIT 1`,
        [customerId]
      );
      const subRow = subResult.rows[0];
      if (!subRow) return;

      // Skip $0 invoices (e.g., trial extensions) to avoid recording zero-value payments.
      if ((invoice.amount_paid || 0) === 0) break;

      await query(
        `INSERT INTO payments (business_id, subscription_id, amount, currency, status, provider, provider_payment_id, provider_customer_id, paid_at, metadata)
         VALUES ($1,$2,$3,$4,'succeeded','stripe',$5,$6,NOW(),$7::jsonb)
         ON CONFLICT (provider_payment_id) DO NOTHING`,
        [
          subRow.business_id,
          subRow.id,
          (invoice.amount_paid / 100),
          invoice.currency.toUpperCase(),
          invoice.id,
          customerId,
          JSON.stringify({ invoiceNumber: invoice.number, hostedInvoiceUrl: invoice.hosted_invoice_url, lastEventId: event.id }),
        ]
      );

      if (subRow.status === 'past_due') {
        await query(
          `UPDATE subscriptions SET status='active', metadata=metadata||$1::jsonb, updated_at=NOW() WHERE id=$2`,
          [JSON.stringify({ lastPaymentFailureResolved: invoice.id, resolvedAt: new Date().toISOString(), lastEventId: event.id }), subRow.id]
        );
        clearSubCache(subRow.business_id);
      }
      break;
    }

    default:
      logger.info('Unhandled Stripe event', { type: event.type });
  }
}
