import { config } from '../../config';
import { BadRequestError } from '../../utils/errors';
import { stripeProvider } from './providers/stripe.provider';
import { manualProvider } from './providers/manual.provider';
import type { PaymentProvider, PaymentProviderInfo } from './types';

/**
 * Billing provider registry.
 *
 * Which provider collects the money is a deployment decision, not a code
 * decision. `BILLING_PROVIDER` selects it; the default falls back to Stripe
 * when it is configured and to offline billing otherwise, so a fresh
 * deployment is always able to take money.
 */

const providers: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
  manual: manualProvider,
};

let cached: { key: string; provider: PaymentProvider } | null = null;

export function getPaymentProvider(): PaymentProvider {
  const requested = (process.env.BILLING_PROVIDER || '').trim().toLowerCase();

  if (requested) {
    const provider = providers[requested];
    if (!provider) {
      throw new BadRequestError(
        `Unknown BILLING_PROVIDER '${requested}'. Supported: ${Object.keys(providers).join(', ')}`
      );
    }
    if (!provider.isConfigured()) {
      throw new BadRequestError(
        `Billing provider '${requested}' is not configured on this environment.`
      );
    }
    if (cached?.key === requested) return cached.provider;
    cached = { key: requested, provider };
    return provider;
  }

  // No explicit choice: use Stripe when it is configured, otherwise fall back
  // to offline billing so the platform can still take money.
  if (stripeProvider.isConfigured()) {
    if (cached?.key !== 'stripe') cached = { key: 'stripe', provider: stripeProvider };
    return stripeProvider;
  }

  if (cached?.key !== 'manual') cached = { key: 'manual', provider: manualProvider };
  return manualProvider;
}

export function getPaymentProviderInfo(): PaymentProviderInfo {
  const provider = getPaymentProvider();
  const info: PaymentProviderInfo = {
    id: provider.id,
    displayName: provider.displayName,
    configured: provider.isConfigured(),
    requiresManualApproval: provider.requiresManualApproval,
  };

  if (provider.requiresManualApproval) {
    info.instructions = {
      accountName: config.billing.accountName,
      accountNumber: config.billing.accountNumber,
      bankName: config.billing.bankName,
      contactEmail: config.billing.paymentEmail,
      contactPhone: config.billing.paymentPhone || undefined,
    };
  }

  return info;
}

/** True when this environment can collect money at all. */
export function paymentsConfigured(): boolean {
  try {
    return getPaymentProvider().isConfigured();
  } catch {
    return false;
  }
}

export { stripeProvider, manualProvider };
export * from './types';
