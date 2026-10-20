import Stripe from 'stripe';
import { query } from '../../../utils/database';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import logger from '../../../utils/logger';
import { getActiveSubscription, getPlanBySlug, clearSubCache } from '../../subscription.service';
import { applyBillingEvent, mapSubscriptionStatus } from '../events';
import type { CheckoutRequest, PaymentProvider } from '../types';

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

/**
 * Records that a webhook was received so redeliveries are ignored.
 * Returns false when the event was already processed.
 */
async function claimEvent(
  provider: string,
  eventId: string,
  eventType: string,
  businessId: string | null,
  payload: unknown
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `INSERT INTO billing_webhook_events (provider, event_id, event_type, business_id, payload, processed_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [provider, eventId, eventType, businessId, JSON.stringify(payload ?? {})]
  );
  return result.rows.length > 0;
}

async function resolveBusinessId(stripeObject: { customer?: unknown; id?: unknown }): Promise<string | null> {
  const customerId = typeof stripeObject.customer === 'string' ? stripeObject.customer : null;
  const subscriptionId = typeof stripeObject.id === 'string' ? stripeObject.id : null;
  const result = await query<{ business_id: string }>(
    `SELECT business_id FROM subscriptions
      WHERE ($1::text IS NOT NULL AND external_customer_id = $1)
         OR ($2::text IS NOT NULL AND external_subscription_id = $2)
      ORDER BY created_at DESC LIMIT 1`,
    [customerId, subscriptionId]
  );
  return result.rows[0]?.business_id ?? null;
}

/**
 * Stripe adapter.
 *
 * Stripe does not support Jamaica as a merchant country, so this provider is
 * only usable once the platform has a Stripe account (for example through a
 * supported-country entity). It remains the reference implementation of the
 * provider contract.
 */
export const stripeProvider: PaymentProvider = {
  id: 'stripe',
  displayName: 'Stripe',
  requiresManualApproval: false,

  isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  },

  async createCheckoutSession(request: CheckoutRequest): Promise<{ url: string }> {
    const { businessId, planSlug, successUrl, cancelUrl } = request;
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
        await query(
          `UPDATE subscriptions SET external_customer_id=$1, metadata=metadata||$2::jsonb WHERE id=$3`,
          [customerId, JSON.stringify({ stripeCustomerId: customerId }), sub.id]
        );
        clearSubCache(businessId);
      }
    }

    // If the local subscription is still in trial, tell Stripe to extend its
    // trial so the first invoice is not generated until the local trial ends.
    const trialEndTimestamp =
      sub.status === 'trialing' && sub.trial_ends_at
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
            product_data: { name: plan.name },
            unit_amount: Math.round(Number(plan.price_monthly) * 100),
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: trialEndTimestamp
          ? Math.max(0, Math.ceil((trialEndTimestamp - Math.floor(Date.now() / 1000)) / 86400))
          : undefined,
        metadata: { businessId, subscriptionId: sub.id, planSlug },
      },
      metadata: { businessId, subscriptionId: sub.id, planSlug },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    return { url: session.url || '' };
  },

  async createCustomerPortalSession(businessId: string, returnUrl: string): Promise<{ url: string }> {
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
  },

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const stripe = getStripe();
    await stripe.subscriptions.cancel(providerSubscriptionId);
  },

  async cancelAtPeriodEnd(providerSubscriptionId: string): Promise<void> {
    const stripe = getStripe();
    await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true });
  },

  async resumeSubscription(providerSubscriptionId: string): Promise<void> {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(providerSubscriptionId);
    if (subscription.status === 'canceled' || subscription.cancel_at_period_end) {
      await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: false });
    }
  },

  async handleWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new BadRequestError('Stripe webhook secret is not configured');
    }

    const stripe = getStripe();
    const signature = (headers['stripe-signature'] as string) || '';

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      logger.warn('Stripe webhook signature verification failed', { error: err?.message });
      throw new BadRequestError('Invalid webhook signature');
    }

    logger.info('Received Stripe webhook', { type: event.type, id: event.id });

    const stripeObject = (event.data.object ?? {}) as { customer?: unknown; id?: unknown };
    const businessId = await resolveBusinessId(stripeObject);

    const claimed = await claimEvent('stripe', event.id, event.type, businessId, {
      object: { customer: stripeObject.customer, id: stripeObject.id },
    });
    if (!claimed) {
      logger.info('Skipping duplicate Stripe event', { type: event.type, id: event.id });
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const sessionBusinessId = session.metadata?.businessId as string | undefined;
        const subscriptionId = session.metadata?.subscriptionId as string | undefined;
        const planSlug = session.metadata?.planSlug as string | undefined;
        const stripeSubscriptionId = session.subscription as string | undefined;
        const stripeCustomerId = session.customer as string | undefined;

        if (!sessionBusinessId || !subscriptionId || !stripeSubscriptionId) {
          logger.warn('Stripe checkout.session.completed missing metadata', { sessionId: session.id });
          return;
        }

        await applyBillingEvent({
          type: 'subscription.activated',
          provider: 'stripe',
          businessId: sessionBusinessId,
          subscriptionId,
          providerCustomerId: stripeCustomerId || undefined,
          providerSubscriptionId: stripeSubscriptionId,
          planSlug,
          metadata: { stripeSessionId: session.id, lastEventId: event.id },
        });
        return;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = (subscription.customer as string) || undefined;
        if (!stripeCustomerId) {
          logger.warn('Stripe subscription event missing customer', { id: subscription.id });
          return;
        }

        await applyBillingEvent({
          type: 'subscription.status_changed',
          provider: 'stripe',
          businessId: businessId ?? undefined,
          status: mapSubscriptionStatus(subscription.status),
          providerCustomerId: stripeCustomerId,
          providerSubscriptionId: subscription.id,
          metadata: { stripeStatus: subscription.status, lastEventId: event.id },
        });
        return;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = (invoice.customer as string) || undefined;
        if (!stripeCustomerId) return;

        await applyBillingEvent({
          type: 'payment.failed',
          provider: 'stripe',
          businessId: businessId ?? '',
          providerCustomerId: stripeCustomerId,
          providerSubscriptionId:
            typeof invoice.subscription === 'string' ? invoice.subscription : undefined,
          reason: invoice.last_finalization_error?.message || 'payment_failed',
          metadata: { invoiceId: invoice.id, lastEventId: event.id },
        });
        return;
      }

      case 'invoice.payment_succeeded':
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = (invoice.customer as string) || undefined;
        if (!stripeCustomerId) return;

        // Skip $0 invoices (trial extensions) so zero-value rows stay out of
        // the ledger.
        if ((invoice.amount_paid || 0) === 0) return;

        await applyBillingEvent({
          type: 'payment.succeeded',
          provider: 'stripe',
          businessId: businessId ?? '',
          providerPaymentId: invoice.id,
          amount: (invoice.amount_paid || 0) / 100,
          currency: invoice.currency,
          providerCustomerId: stripeCustomerId,
          providerSubscriptionId:
            typeof invoice.subscription === 'string' ? invoice.subscription : undefined,
          metadata: {
            invoiceNumber: invoice.number,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
            lastEventId: event.id,
          },
        });
        return;
      }

      default:
        logger.info('Unhandled Stripe event', { type: event.type });
    }
  },
};

export default stripeProvider;
