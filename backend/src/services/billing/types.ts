import type { SubscriptionStatus } from '../../types';

/**
 * Provider-neutral billing events.
 *
 * Every payment provider adapter translates its own webhook payloads into
 * these shapes. `applyBillingEvent()` is the only place that is allowed to
 * change a subscription's status or write to the payments ledger, which keeps
 * entitlement logic identical no matter who collects the money.
 *
 * This matters because Stripe does not support Jamaica as a merchant country,
 * so the platform cannot assume Stripe is the processor.
 */
export type BillingEvent =
  | {
      type: 'subscription.activated';
      provider: string;
      businessId: string;
      subscriptionId?: string;
      providerCustomerId?: string;
      providerSubscriptionId?: string;
      planSlug?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'subscription.status_changed';
      provider: string;
      businessId?: string;
      status: SubscriptionStatus;
      providerCustomerId?: string;
      providerSubscriptionId?: string;
      reason?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'payment.succeeded';
      provider: string;
      businessId: string;
      providerPaymentId: string;
      amount: number;
      currency: string;
      providerCustomerId?: string;
      providerSubscriptionId?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'payment.failed';
      provider: string;
      businessId: string;
      providerPaymentId?: string;
      providerCustomerId?: string;
      providerSubscriptionId?: string;
      reason?: string;
      metadata?: Record<string, unknown>;
    };

export interface CheckoutRequest {
  businessId: string;
  planSlug: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  /** Stable identifier, stored on `payments.provider`. */
  readonly id: string;
  readonly displayName: string;
  /**
   * True when a person must confirm that money arrived (bank transfer, cash,
   * offline invoice). The UI shows payment instructions instead of a hosted
   * checkout and the platform owner confirms the request.
   */
  readonly requiresManualApproval: boolean;
  /** Whether this provider can collect money on this environment right now. */
  isConfigured(): boolean;
  createCheckoutSession(request: CheckoutRequest): Promise<{ url: string }>;
  createCustomerPortalSession(businessId: string, returnUrl: string): Promise<{ url: string }>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  /**
   * Schedule a cancellation at the end of the paid period. Providers that
   * support it should set their own flag too; providers that do not can leave
   * this undefined and rely on the local `cancel_at_period_end` column.
   */
  cancelAtPeriodEnd?(providerSubscriptionId: string): Promise<void>;
  resumeSubscription(providerSubscriptionId: string): Promise<void>;
  /** Verify a webhook signature and translate it into billing events. */
  handleWebhook?(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<void>;
}

export interface PaymentProviderInfo {
  id: string;
  displayName: string;
  configured: boolean;
  requiresManualApproval: boolean;
  /** Payment details to show the customer, when instructions are needed. */
  instructions?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    contactEmail: string;
    contactPhone?: string;
  };
}
