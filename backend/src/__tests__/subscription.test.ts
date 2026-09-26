import { Request, Response, NextFunction } from 'express';
import { requireActiveSubscription, requireUsageLimit } from '../middleware/subscription';
import {
  isUsable,
  trialDaysLeft,
  getPlanLimit,
  assertUsable,
  getActiveSubscription,
  requireFeatureLimit,
} from '../services/subscription.service';
import { PaymentRequiredError, ForbiddenError } from '../utils/errors';
import { Plan, SubscriptionWithPlan, UserPayload } from '../types';

jest.mock('../services/subscription.service', () => {
  const actual = jest.requireActual('../services/subscription.service');
  return {
    ...actual,
    getActiveSubscription: jest.fn(),
    requireFeatureLimit: jest.fn(),
  };
});

const mockGetActiveSubscription = getActiveSubscription as jest.MockedFunction<typeof getActiveSubscription>;
const mockRequireFeatureLimit = requireFeatureLimit as jest.MockedFunction<typeof requireFeatureLimit>;

function makePlan(limits: Record<string, number>): Plan {
  return {
    id: 'plan-1',
    name: 'Starter',
    slug: 'starter',
    price_monthly: 49,
    price_yearly: 490,
    currency: 'USD',
    features: {},
    limits,
    sort_order: 1,
    is_active: true,
    is_public: true,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  } as unknown as Plan;
}

function makeSub(overrides: Partial<SubscriptionWithPlan> = {}): SubscriptionWithPlan {
  return {
    id: 'sub-1',
    business_id: 'tenant-a',
    plan_id: 'plan-1',
    status: 'active',
    current_period_start: new Date(),
    current_period_end: new Date(Date.now() + 30 * 86400000),
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    plan: makePlan({ ai_responses: 500, staff_users: 1 }),
    ...overrides,
  } as SubscriptionWithPlan;
}

function makeReq(user?: Partial<UserPayload>): Request {
  return {
    path: '/api/conversations',
    method: 'GET',
    ...(user ? { user: user as UserPayload } : {}),
  } as unknown as Request;
}

function makeRes(): Response {
  return { locals: {} } as unknown as Response;
}

const tenantUser: Partial<UserPayload> = {
  id: 'u1',
  role: 'admin',
  businessId: 'tenant-a',
  tenantId: 'tenant-a',
};

describe('Subscription gating (pure functions)', () => {
  describe('isUsable', () => {
    it('rejects a missing subscription', () => {
      expect(isUsable(null)).toBe(false);
    });

    it('accepts an active subscription', () => {
      expect(isUsable(makeSub({ status: 'active' }))).toBe(true);
    });

    it('accepts a trial that has not ended', () => {
      expect(
        isUsable(makeSub({ status: 'trialing', trial_ends_at: new Date(Date.now() + 86400000) }))
      ).toBe(true);
    });

    it('rejects a trial past its end date', () => {
      expect(
        isUsable(makeSub({ status: 'trialing', trial_ends_at: new Date(Date.now() - 86400000) }))
      ).toBe(false);
    });

    it('accepts past_due within the grace window', () => {
      expect(
        isUsable(makeSub({ status: 'past_due', grace_period_ends_at: new Date(Date.now() + 86400000) }))
      ).toBe(true);
    });

    it('rejects past_due beyond the grace window', () => {
      expect(
        isUsable(makeSub({ status: 'past_due', grace_period_ends_at: new Date(Date.now() - 1000) }))
      ).toBe(false);
    });

    it('rejects canceled and expired subscriptions', () => {
      expect(isUsable(makeSub({ status: 'canceled' }))).toBe(false);
      expect(isUsable(makeSub({ status: 'expired' }))).toBe(false);
    });
  });

  describe('trialDaysLeft', () => {
    it('returns null without a trialing subscription', () => {
      expect(trialDaysLeft(null)).toBeNull();
      expect(trialDaysLeft(makeSub({ status: 'active' }))).toBeNull();
    });

    it('returns whole days remaining, never below zero', () => {
      expect(
        trialDaysLeft(makeSub({ status: 'trialing', trial_ends_at: new Date(Date.now() + 3 * 86400000) }))
      ).toBe(3);
      expect(
        trialDaysLeft(makeSub({ status: 'trialing', trial_ends_at: new Date(Date.now() - 86400000) }))
      ).toBe(0);
    });
  });

  describe('getPlanLimit', () => {
    it('returns the configured limit for a known metric', () => {
      expect(getPlanLimit(makePlan({ ai_responses: 500 }), 'ai_responses')).toBe(500);
    });

    it('passes through the unlimited sentinel', () => {
      expect(getPlanLimit(makePlan({ ai_responses: -1 }), 'ai_responses')).toBe(-1);
    });

    it('returns undefined for unknown metrics (fail open)', () => {
      expect(getPlanLimit(makePlan({}), 'storage_mb')).toBeUndefined();
    });

    it('returns undefined when the limit is absent or invalid', () => {
      expect(getPlanLimit(makePlan({}), 'ai_responses')).toBeUndefined();
      expect(getPlanLimit(makePlan({ ai_responses: NaN }), 'ai_responses')).toBeUndefined();
    });
  });

  describe('assertUsable', () => {
    it('passes for a usable subscription', () => {
      expect(() => assertUsable(makeSub({ status: 'active' }))).not.toThrow();
    });

    it('throws 402 when no subscription exists', () => {
      try {
        assertUsable(null);
        fail('expected PaymentRequiredError');
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentRequiredError);
        expect((err as PaymentRequiredError).statusCode).toBe(402);
      }
    });

    it('throws 403 for a canceled subscription', () => {
      try {
        assertUsable(makeSub({ status: 'canceled' }));
        fail('expected ForbiddenError');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenError);
        expect((err as ForbiddenError).statusCode).toBe(403);
      }
    });
  });
});

describe('requireActiveSubscription middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes through unauthenticated requests without a lookup', async () => {
    const next = jest.fn();
    await requireActiveSubscription(makeReq(), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(mockGetActiveSubscription).not.toHaveBeenCalled();
  });

  it('never gates super_admin sessions', async () => {
    const next = jest.fn();
    const req = makeReq({ id: 'root', role: 'super_admin', businessId: 'tenant-a', tenantId: 'tenant-a' });
    await requireActiveSubscription(req, makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(mockGetActiveSubscription).not.toHaveBeenCalled();
  });

  it('attaches a usable subscription and exposes trial days', async () => {
    const sub = makeSub({
      status: 'trialing',
      trial_ends_at: new Date(Date.now() + 5 * 86400000),
    });
    mockGetActiveSubscription.mockResolvedValue(sub);

    const next = jest.fn();
    const res = makeRes();
    await requireActiveSubscription(makeReq(tenantUser), res, next as unknown as NextFunction);

    expect(mockGetActiveSubscription).toHaveBeenCalledWith('tenant-a');
    expect(next).toHaveBeenCalledWith();
    expect(res.locals.trialDaysLeft).toBe(5);
  });

  it('rejects a tenant with no subscription with 402', async () => {
    mockGetActiveSubscription.mockResolvedValue(null);

    const next = jest.fn();
    await requireActiveSubscription(makeReq(tenantUser), makeRes(), next as unknown as NextFunction);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(PaymentRequiredError);
    expect(err.statusCode).toBe(402);
  });

  it('rejects an expired trial with 402', async () => {
    mockGetActiveSubscription.mockResolvedValue(
      makeSub({ status: 'trialing', trial_ends_at: new Date(Date.now() - 1000) })
    );

    const next = jest.fn();
    await requireActiveSubscription(makeReq(tenantUser), makeRes(), next as unknown as NextFunction);

    expect(next.mock.calls[0][0]).toBeInstanceOf(PaymentRequiredError);
  });

  it('fails open on infrastructure errors', async () => {
    mockGetActiveSubscription.mockRejectedValue(new Error('relation does not exist'));

    const next = jest.fn();
    await requireActiveSubscription(makeReq(tenantUser), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('requireUsageLimit middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows the request when the quota is not reached', async () => {
    mockRequireFeatureLimit.mockResolvedValue(undefined);

    const next = jest.fn();
    await requireUsageLimit('ai_responses')(makeReq(tenantUser), makeRes(), next as unknown as NextFunction);

    expect(mockRequireFeatureLimit).toHaveBeenCalledWith('tenant-a', 'ai_responses');
    expect(next).toHaveBeenCalledWith();
  });

  it('propagates 402 when the quota is exhausted', async () => {
    mockRequireFeatureLimit.mockRejectedValue(new PaymentRequiredError('Quota reached'));

    const next = jest.fn();
    await requireUsageLimit('ai_responses')(makeReq(tenantUser), makeRes(), next as unknown as NextFunction);

    expect(next.mock.calls[0][0]).toBeInstanceOf(PaymentRequiredError);
  });

  it('fails open on infrastructure errors', async () => {
    mockRequireFeatureLimit.mockRejectedValue(new Error('connection refused'));

    const next = jest.fn();
    await requireUsageLimit('ai_responses')(makeReq(tenantUser), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });

  it('skips enforcement without a tenant scope', async () => {
    const next = jest.fn();
    await requireUsageLimit('ai_responses')(makeReq(), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(mockRequireFeatureLimit).not.toHaveBeenCalled();
  });
});
