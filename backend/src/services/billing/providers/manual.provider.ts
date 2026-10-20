import { BadRequestError } from '../../../utils/errors';
import { query } from '../../../utils/database';
import logger from '../../../utils/logger';
import { getActiveSubscription, getPlanBySlug } from '../../subscription.service';
import { createPaymentRequest } from '../paymentRequests.service';
import { emailService } from '../../email.service';
import type { CheckoutRequest, PaymentProvider } from '../types';

/**
 * Offline payment provider.
 *
 * Used when no card processor is available for the platform's country of
 * incorporation. The customer is given bank details and a reference, pays
 * however they like (transfer, PayPal invoice, cash), and a platform owner
 * confirms receipt.
 *
 * This keeps the platform able to charge money on day one while a card
 * processor relationship is being put in place.
 */
export const manualProvider: PaymentProvider = {
  id: 'manual',
  displayName: 'Bank transfer',
  requiresManualApproval: true,

  isConfigured(): boolean {
    // Only the contact address is required. The account number can be added
    // later — until then the Billing page tells the customer that our team
    // will send the details.
    return Boolean(process.env.BILLING_PAYMENT_EMAIL);
  },

  async createCheckoutSession(request: CheckoutRequest): Promise<{ url: string }> {
    const { businessId, planSlug } = request;

    // Validate the plan up front so a bad slug does not create a request.
    const plan = await getPlanBySlug(planSlug);
    const sub = await getActiveSubscription(businessId);
    if (!sub) throw new BadRequestError('No active subscription');

    const paymentRequest = await createPaymentRequest({ businessId, planSlug });

    // Send the instructions by email so the customer has them off-platform. A
    // missing mail provider must not block the request — the Billing page
    // always shows the same details.
    const contact = await query<{ name: string; email: string | null }>(
      `SELECT name, email FROM businesses WHERE id = $1 LIMIT 1`,
      [businessId]
    );
    const business = contact.rows[0];
    if (business?.email) {
      try {
        await emailService.sendPaymentRequest(business.email, business.name, {
          reference: paymentRequest.reference,
          amount: Number(paymentRequest.amount),
          currency: paymentRequest.currency,
          planName: plan.name,
          periodEnd: sub.current_period_end ?? new Date(),
          isRenewal: sub.status === 'active',
        });
      } catch (error) {
        logger.warn('Payment request email not delivered', {
          businessId,
          reference: paymentRequest.reference,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      url: `/billing?plan=${encodeURIComponent(planSlug)}&ref=${encodeURIComponent(
        paymentRequest.reference
      )}&status=requested`,
    };
  },

  async createCustomerPortalSession(): Promise<{ url: string }> {
    throw new BadRequestError(
      'Self-service billing management is not available for offline billing. Contact support to change your plan.'
    );
  },

  async cancelSubscription(): Promise<void> {
    // Nothing to cancel remotely — the local subscription row is the record.
  },

  async resumeSubscription(): Promise<void> {
    // Nothing to resume remotely.
  },
};

export default manualProvider;
