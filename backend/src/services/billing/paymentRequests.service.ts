import crypto from 'crypto';
import { query } from '../../utils/database';
import logger from '../../utils/logger';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { getActiveSubscription, getPlanBySlug, clearSubCache } from '../subscription.service';
import { applyBillingEvent } from './events';

export type PaymentRequest = {
  id: string;
  business_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  reference: string;
  amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
  method: string;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  business_name?: string;
  plan_name?: string;
};

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReference(): string {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += REFERENCE_ALPHABET[bytes[i]! % REFERENCE_ALPHABET.length];
  }
  return `WAF-${out}`;
}

/**
 * Creates (or reuses) an offline payment request.
 *
 * The customer receives bank details and a reference, pays however they like,
 * and a platform owner confirms receipt. Confirmation activates the
 * subscription through the same billing-event pipeline used by every other
 * provider, so entitlements behave identically.
 */
export async function createPaymentRequest(input: {
  businessId: string;
  planSlug: string;
}): Promise<PaymentRequest> {
  const plan = await getPlanBySlug(input.planSlug);
  const sub = await getActiveSubscription(input.businessId);
  if (!sub) throw new NotFoundError('No active subscription');

  // Reuse an existing pending request for the same plan rather than stacking
  // duplicate instructions the customer has to pick between.
  const existing = await query<PaymentRequest>(
    `SELECT * FROM payment_requests
      WHERE business_id = $1 AND plan_id = $2 AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1`,
    [input.businessId, plan.id]
  );
  if (existing.rows[0]) return existing.rows[0];

  // Retry on the astronomically unlikely reference collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateReference();
    try {
      const result = await query<PaymentRequest>(
        `INSERT INTO payment_requests
           (business_id, subscription_id, plan_id, reference, amount, currency, status, method, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,'pending','bank_transfer',$7::jsonb)
         RETURNING *`,
        [
          input.businessId,
          sub.id,
          plan.id,
          reference,
          plan.price_monthly,
          plan.currency,
          JSON.stringify({ planSlug: plan.slug, planName: plan.name }),
        ]
      );
      logger.info('Payment request created', {
        businessId: input.businessId,
        reference,
        amount: plan.price_monthly,
      });
      return result.rows[0]!;
    } catch (err: any) {
      if (err?.code === '23505' && attempt < 4) continue;
      throw err;
    }
  }

  throw new BadRequestError('Could not create a payment reference. Please try again.');
}

export async function listPaymentRequests(options: { status?: string } = {}): Promise<PaymentRequest[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.status) {
    params.push(options.status);
    conditions.push(`pr.status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query<PaymentRequest>(
    `SELECT pr.*, b.name AS business_name, p.name AS plan_name
       FROM payment_requests pr
       LEFT JOIN businesses b ON b.id = pr.business_id
       LEFT JOIN plans p ON p.id = pr.plan_id
       ${where}
      ORDER BY pr.created_at DESC
      LIMIT 200`,
    params
  );
  return result.rows;
}

export async function getPaymentRequest(idOrReference: string): Promise<PaymentRequest> {
  const result = await query<PaymentRequest>(
    `SELECT pr.*, b.name AS business_name, p.name AS plan_name
       FROM payment_requests pr
       LEFT JOIN businesses b ON b.id = pr.business_id
       LEFT JOIN plans p ON p.id = pr.plan_id
      WHERE pr.id = $1::uuid OR pr.reference = $2
      LIMIT 1`,
    [idOrReference, idOrReference]
  );
  if (!result.rows[0]) throw new NotFoundError('Payment request not found');
  return result.rows[0];
}

/**
 * Confirms that money arrived and activates the subscription.
 *
 * The subscription period is set locally because there is no provider billing
 * cycle to mirror.
 */
export async function confirmPaymentRequest(
  idOrReference: string,
  confirmedBy: string | null,
  notes?: string
): Promise<PaymentRequest> {
  const request = await getPaymentRequest(idOrReference);
  if (request.status !== 'pending') {
    throw new BadRequestError(`Payment request is already ${request.status}`);
  }

  const updated = await query<PaymentRequest>(
    `UPDATE payment_requests
        SET status='confirmed', confirmed_by=$1, confirmed_at=NOW(),
            notes=COALESCE($2, notes), updated_at=NOW()
      WHERE id=$3
      RETURNING *`,
    [confirmedBy, notes ?? null, request.id]
  );

  const metadata = (request.metadata || {}) as Record<string, unknown>;
  const planSlug = typeof metadata.planSlug === 'string' ? metadata.planSlug : undefined;

  await applyBillingEvent({
    type: 'subscription.activated',
    provider: 'manual',
    businessId: request.business_id,
    subscriptionId: request.subscription_id ?? undefined,
    planSlug,
    metadata: { paymentRequestId: request.id, reference: request.reference },
  });

  await applyBillingEvent({
    type: 'payment.succeeded',
    provider: 'manual',
    businessId: request.business_id,
    providerPaymentId: request.reference,
    amount: Number(request.amount),
    currency: request.currency,
    metadata: { paymentRequestId: request.id, method: request.method },
  });

  await query(
    `UPDATE subscriptions
        SET current_period_start=NOW(),
            current_period_end=NOW() + make_interval(months => 1),
            updated_at=NOW()
      WHERE id=$1`,
    [request.subscription_id]
  );
  clearSubCache(request.business_id);

  logger.info('Payment request confirmed', {
    reference: request.reference,
    businessId: request.business_id,
    confirmedBy,
  });

  return updated.rows[0]!;
}

export async function rejectPaymentRequest(
  idOrReference: string,
  rejectedBy: string | null,
  notes?: string
): Promise<PaymentRequest> {
  const request = await getPaymentRequest(idOrReference);
  if (request.status !== 'pending') {
    throw new BadRequestError(`Payment request is already ${request.status}`);
  }
  const updated = await query<PaymentRequest>(
    `UPDATE payment_requests
        SET status='rejected', confirmed_by=$1, notes=COALESCE($2, notes), updated_at=NOW()
      WHERE id=$3
      RETURNING *`,
    [rejectedBy, notes ?? null, request.id]
  );
  logger.info('Payment request rejected', { reference: request.reference, rejectedBy });
  return updated.rows[0]!;
}
