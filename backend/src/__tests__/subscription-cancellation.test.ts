import { query } from '../utils/database';
import {
  scheduleCancellation,
  clearScheduledCancellation,
  applyScheduledCancellations,
} from '../services/billing/cancellation.service';

jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../services/subscription.service', () => {
  const actual = jest.requireActual('../services/subscription.service');
  return {
    ...actual,
    clearSubCache: jest.fn(),
  };
});

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(value: any[]) {
  return { rows: value, rowCount: value.length } as any;
}

beforeEach(() => {
  mockQuery.mockReset();
  delete process.env.BILLING_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
  process.env.BILLING_PROVIDER = 'manual';
  process.env.BILLING_PAYMENT_EMAIL = 'billing@example.com';
});

describe('self-service cancellation', () => {
  it('schedules cancellation for the end of the paid period', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 'sub-1',
          business_id: 'biz-1',
          status: 'active',
          cancel_at_period_end: new Date('2026-12-01'),
          external_subscription_id: null,
        },
      ])
    );

    const subscription = await scheduleCancellation('biz-1');

    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('cancel_at_period_end = current_period_end');
    // A cancellation must never cut off a period the customer already paid for.
    expect(sql).not.toContain("SET status='canceled'");
    expect(subscription?.cancel_at_period_end).toEqual(new Date('2026-12-01'));
  });

  it('refuses to cancel when there is nothing to cancel', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    await expect(scheduleCancellation('biz-1')).rejects.toThrow(/no subscription to cancel/i);
  });

  it('clears a scheduled cancellation', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 'sub-1',
          business_id: 'biz-1',
          status: 'active',
          cancel_at_period_end: new Date('2026-12-01'),
          external_subscription_id: null,
        },
      ])
    );

    await clearScheduledCancellation('biz-1');

    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('cancel_at_period_end = NULL');
  });

  it('applies cancellations only once the paid period has ended', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 'sub-1', business_id: 'biz-1' }]));

    const count = await applyScheduledCancellations();

    expect(count).toBe(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain("SET status='canceled'");
    expect(sql).toContain('cancel_at_period_end <= NOW()');
  });

  it('never cancels a subscription whose period has not ended', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const count = await applyScheduledCancellations();

    expect(count).toBe(0);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('cancel_at_period_end <= NOW()');
  });
});
