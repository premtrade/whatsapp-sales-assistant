import { query } from '../utils/database';
import {
  runOfflineBillingLifecycle,
  createRenewalRequests,
  markUnpaidPeriodsPastDue,
  expireUnpaidSubscriptions,
} from '../services/billing/offlineBilling.service';

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

jest.mock('../services/billing/paymentRequests.service', () => ({
  createPaymentRequest: jest.fn(),
  listPaymentRequests: jest.fn(),
}));

jest.mock('../services/billing/notification.service', () => ({
  notifyPaymentRequest: jest.fn().mockResolvedValue('whatsapp'),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const { createPaymentRequest, listPaymentRequests } = jest.requireMock('../services/billing/paymentRequests.service');
const { notifyPaymentRequest } = jest.requireMock('../services/billing/notification.service');

function rows(value: any[]) {
  return { rows: value, rowCount: value.length } as any;
}

beforeEach(() => {
  mockQuery.mockReset();
  createPaymentRequest.mockReset();
  listPaymentRequests.mockReset();
  listPaymentRequests.mockResolvedValue([]);
  process.env.BILLING_PROVIDER = 'manual';
  process.env.BILLING_PAYMENT_EMAIL = 'billing@example.com';
});

describe('offline billing lifecycle', () => {
  it('does nothing when a card processor is active', async () => {
    process.env.BILLING_PROVIDER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    const result = await runOfflineBillingLifecycle();

    expect(result).toEqual({ renewalsCreated: 0, markedPastDue: 0, expired: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('raises a renewal request before the paid period ends', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 'sub-1',
          business_id: 'biz-1',
          business_name: 'Demo Construction',
          email: 'owner@demo.test',
          plan_slug: 'professional',
          plan_name: 'Professional',
          price_monthly: '199',
          currency: 'USD',
          current_period_end: new Date(),
        },
      ])
    );
    createPaymentRequest.mockResolvedValue({
      id: 'pr-1',
      business_id: 'biz-1',
      reference: 'WAF-ABCD2345',
      amount: 199,
      currency: 'USD',
      status: 'pending',
      method: 'bank_transfer',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    const created = await createRenewalRequests();

    expect(created).toBe(1);
    expect(createPaymentRequest).toHaveBeenCalledWith({
      businessId: 'biz-1',
      planSlug: 'professional',
    });
    expect(notifyPaymentRequest).toHaveBeenCalledWith('biz-1', {
      reference: 'WAF-ABCD2345',
      amount: 199,
      currency: 'USD',
      planName: 'Professional',
      periodEnd: expect.any(Date),
      isRenewal: true,
    });
  });

  it('does not raise a second request while one is already pending', async () => {
    listPaymentRequests.mockResolvedValue([
      {
        id: 'pr-existing',
        business_id: 'biz-1',
        reference: 'WAF-EXISTING',
        amount: 199,
        currency: 'USD',
        status: 'pending',
        method: 'bank_transfer',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 'sub-1',
          business_id: 'biz-1',
          business_name: 'Demo Construction',
          email: 'owner@demo.test',
          plan_slug: 'professional',
          plan_name: 'Professional',
          price_monthly: '199',
          currency: 'USD',
          current_period_end: new Date(),
        },
      ])
    );

    const created = await createRenewalRequests();

    expect(created).toBe(0);
    expect(createPaymentRequest).not.toHaveBeenCalled();
  });

  it('moves an unpaid period to past_due and opens a grace period', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 'sub-1', business_id: 'biz-1' }]));

    const count = await markUnpaidPeriodsPastDue();

    expect(count).toBe(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain("SET status='past_due'");
    // Only offline subscriptions are touched — processor subscriptions are
    // driven by their own webhooks.
    expect(sql).toContain("metadata->>'provider' = $2");
  });

  it('expires a subscription whose grace period has run out', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 'sub-1', business_id: 'biz-1' }]));

    const count = await expireUnpaidSubscriptions();

    expect(count).toBe(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain("SET status='expired'");
    expect(sql).toContain("grace_period_ends_at <= NOW()");
  });

  it('runs all three stages and reports the totals', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([])) // renewal candidates
      .mockResolvedValueOnce(rows([{ id: 'sub-3', business_id: 'biz-3' }])) // scheduled cancellations
      .mockResolvedValueOnce(rows([{ id: 'sub-1', business_id: 'biz-1' }])) // past due
      .mockResolvedValueOnce(rows([{ id: 'sub-2', business_id: 'biz-2' }])); // expired

    const result = await runOfflineBillingLifecycle();

    expect(result).toEqual({ renewalsCreated: 0, markedPastDue: 1, expired: 1 });
  });

  it('survives a database failure without throwing', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const result = await runOfflineBillingLifecycle();

    expect(result).toEqual({ renewalsCreated: 0, markedPastDue: 0, expired: 0 });
  });
});
