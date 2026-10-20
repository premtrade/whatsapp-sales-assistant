import { query } from '../utils/database';
import { applyBillingEvent, mapSubscriptionStatus } from '../services/billing/events';
import { getPaymentProvider, getPaymentProviderInfo, paymentsConfigured } from '../services/billing';
import { stripeProvider } from '../services/billing/providers/stripe.provider';
import { manualProvider } from '../services/billing/providers/manual.provider';

jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../services/subscription.service', () => {
  const actual = jest.requireActual('../services/subscription.service');
  return {
    ...actual,
    getActiveSubscription: jest.fn(),
    getPlanBySlug: jest.fn(),
    clearSubCache: jest.fn(),
  };
});

const mockQuery = query as jest.MockedFunction<typeof query>;
const { getPlanBySlug } = jest.requireMock('../services/subscription.service');

function rows(value: any[]) {
  return { rows: value, rowCount: value.length } as any;
}

/** Finds the query call whose SQL contains the given fragment. */
function findCall(fragment: string): { sql: string; params: unknown[] } | undefined {
  const call = mockQuery.mock.calls.find((c) => (c[0] as string).includes(fragment));
  return call ? { sql: call[0] as string, params: (call[1] ?? []) as unknown[] } : undefined;
}

beforeEach(() => {
  mockQuery.mockReset();
  (getPlanBySlug as jest.Mock).mockReset();
  (getPlanBySlug as jest.Mock).mockResolvedValue({ id: 'plan-1', slug: 'professional' });
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.BILLING_PROVIDER;
  process.env.BILLING_ACCOUNT_NUMBER = '0123456789';
  process.env.BILLING_PAYMENT_EMAIL = 'billing@example.com';
});

describe('mapSubscriptionStatus', () => {
  it('maps provider vocabulary onto platform vocabulary', () => {
    expect(mapSubscriptionStatus('active')).toBe('active');
    expect(mapSubscriptionStatus('trialing')).toBe('trialing');
    expect(mapSubscriptionStatus('past_due')).toBe('past_due');
    expect(mapSubscriptionStatus('unpaid')).toBe('past_due');
    expect(mapSubscriptionStatus('canceled')).toBe('canceled');
    expect(mapSubscriptionStatus('incomplete_expired')).toBe('expired');
    expect(mapSubscriptionStatus('something-else')).toBe('paused');
  });
});

describe('applyBillingEvent', () => {
  it('activates a subscription and records the conversion timestamp', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 'sub-1', business_id: 'biz-1', status: 'trialing' }]));

    await applyBillingEvent({
      type: 'subscription.activated',
      provider: 'manual',
      businessId: 'biz-1',
      subscriptionId: 'sub-1',
      planSlug: 'professional',
      providerSubscriptionId: 'ext-1',
      providerCustomerId: 'cus-1',
    });

    const update = findCall("SET status='active'");
    expect(update).toBeDefined();
    expect(update!.sql).toContain('plan_id=COALESCE');
    expect(update!.params).toEqual([
      'plan-1',
      'ext-1',
      'cus-1',
      expect.any(String),
      'sub-1',
    ]);
  });

  it('writes a payment to the ledger using the idempotency key', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 'sub-1', business_id: 'biz-1', status: 'active' }]));

    await applyBillingEvent({
      type: 'payment.succeeded',
      provider: 'manual',
      businessId: 'biz-1',
      providerPaymentId: 'WAF-ABC12345',
      amount: 199,
      currency: 'usd',
    });

    const insert = findCall('INSERT INTO payments');
    expect(insert).toBeDefined();
    // provider_payment_id only carries a plain index, so it must not be used
    // as an ON CONFLICT target — idempotency_key is the unique column.
    expect(insert!.sql).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    expect(insert!.sql).not.toContain('ON CONFLICT (provider_payment_id)');
    expect(insert!.params).toEqual(
      expect.arrayContaining(['biz-1', 'sub-1', 199, 'USD', 'manual', 'WAF-ABC12345', 'manual:WAF-ABC12345'])
    );
  });

  it('opens a grace period when a payment fails', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 'sub-1', business_id: 'biz-1', status: 'active' }]));

    await applyBillingEvent({
      type: 'payment.failed',
      provider: 'manual',
      businessId: 'biz-1',
      reason: 'insufficient funds',
    });

    const update = findCall("SET status='past_due'");
    expect(update).toBeDefined();
    expect(update!.sql).toContain('grace_period_ends_at=NOW() + make_interval(days => $1)');
  });

  it('clears a past-due state when a payment succeeds', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 'sub-1', business_id: 'biz-1', status: 'past_due' }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));

    await applyBillingEvent({
      type: 'payment.succeeded',
      provider: 'manual',
      businessId: 'biz-1',
      providerPaymentId: 'WAF-XYZ',
      amount: 79,
      currency: 'USD',
    });

    const calls = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => s.includes("SET status='active'"))).toBe(true);
  });

  it('does nothing when the event matches no local subscription', async () => {
    mockQuery.mockResolvedValue(rows([]));

    await applyBillingEvent({
      type: 'subscription.activated',
      provider: 'stripe',
      businessId: 'missing',
    });

    const updateCalls = mockQuery.mock.calls.filter((c) => (c[0] as string).includes('UPDATE subscriptions'));
    expect(updateCalls).toHaveLength(0);
  });
});

describe('provider registry', () => {
  it('falls back to offline billing when Stripe is not configured', () => {
    expect(getPaymentProvider().id).toBe('manual');
    expect(paymentsConfigured()).toBe(true);
  });

  it('uses Stripe when it is configured', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    expect(getPaymentProvider().id).toBe('stripe');
  });

  it('honours an explicit provider selection', () => {
    process.env.BILLING_PROVIDER = 'manual';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    expect(getPaymentProvider().id).toBe('manual');
  });

  it('rejects an unknown provider', () => {
    process.env.BILLING_PROVIDER = 'nope';
    expect(() => getPaymentProvider()).toThrow(/Unknown BILLING_PROVIDER/);
  });

  it('exposes payment instructions for offline billing only', () => {
    const manual = getPaymentProviderInfo();
    expect(manual.requiresManualApproval).toBe(true);
    expect(manual.instructions?.accountNumber).toBe('0123456789');

    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    const stripe = getPaymentProviderInfo();
    expect(stripe.requiresManualApproval).toBe(false);
    expect(stripe.instructions).toBeUndefined();
  });

  it('marks the offline provider as needing a person to confirm', () => {
    expect(manualProvider.requiresManualApproval).toBe(true);
    expect(stripeProvider.requiresManualApproval).toBe(false);
  });
});
