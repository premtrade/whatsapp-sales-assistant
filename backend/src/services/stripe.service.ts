import Stripe from 'stripe';
import { query } from '../utils/database';
import { BadRequestError, NotFoundError } from '../utils/errors';
import logger from '../utils/logger';
import { getActiveSubscription, getPlanById, clearSubCache } from './subscription.service';
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

  const plan = await getPlanById(sub.plan_id);

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
    customerId = matches.data[0]?.id || undefined;
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

      await query(
        `UPDATE subscriptions
         SET status='active', external_subscription_id=$1, external_customer_id=$2, metadata=metadata||$3::jsonb, updated_at=NOW()
         WHERE id=$4`,
        [stripeSubscriptionId, stripeCustomerId || null, JSON.stringify({ stripeSessionId: session.id, planSlug }), subscriptionId]
      );
      clearSubCache(businessId);
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
      else if (stripeSubscription.status === 'incomplete_expired') status = 'expired';
      else status = 'paused';

      await query(
        `UPDATE subscriptions SET status=$1, external_subscription_id=$2, metadata=metadata||$3::jsonb, updated_at=NOW() WHERE id=$4`,
        [status, stripeSubscription.id, JSON.stringify({ stripeStatus: stripeSubscription.status }), subRow.id]
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
        `UPDATE subscriptions SET status='past_due', metadata=metadata||$1::jsonb, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify({ lastPaymentFailure: invoice.id, failureReason: invoice.last_finalization_error?.message || null }), subRow.id]
      );
      clearSubCache(subRow.business_id);
      break;
    }

    case 'invoice.paid': {
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
          JSON.stringify({ invoiceNumber: invoice.number, hostedInvoiceUrl: invoice.hosted_invoice_url }),
        ]
      );
      break;
    }

    default:
      logger.info('Unhandled Stripe event', { type: event.type });
  }
}
