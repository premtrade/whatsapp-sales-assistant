-- ==========================================================
-- Beta/Trial Launch — Item 1: Subscription Data Model
-- File    : 049_plans_subscriptions_entitlements.sql
-- Adds    : plans, subscriptions, entitlements, usage_counters,
--           feature_flags. Seeds the three landing-page tiers
--           (Starter / Professional / Business) and a 14-day
--           trial policy matching the marketing copy.
-- Depends : 045_multi_tenancy.sql (businesses table)
-- ==========================================================

SET search_path TO public;

-- ----------------------------------------------------------
-- 1. PLANS (mirrors pricingTiers[] in frontend/src/pages/LandingPage.tsx)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,              -- 'starter' | 'professional' | 'business'
    name VARCHAR(100) NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,        -- 7900 | 19900 | 39900 (USD)
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'month'
        CHECK (billing_interval IN ('month', 'year')),
    ai_responses_per_period INTEGER,               -- NULL = unlimited
    max_staff_users INTEGER,                       -- NULL = unlimited
    max_locations INTEGER,                         -- NULL = unlimited
    trial_days INTEGER NOT NULL DEFAULT 14,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,       -- show on pricing page
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_public ON plans(is_public);

DROP TRIGGER IF EXISTS trg_plans_updated ON plans;
CREATE TRIGGER trg_plans_updated
    BEFORE UPDATE ON plans
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

INSERT INTO plans (code, name, price_cents, currency, billing_interval,
                   ai_responses_per_period, max_staff_users, max_locations, trial_days, is_public)
VALUES
    ('starter',      'Starter',      7900,  'USD', 'month',   500,  1,  1,  14, TRUE),
    ('professional', 'Professional', 19900, 'USD', 'month',  2000,  5,  3,  14, TRUE),
    ('business',     'Business',     39900, 'USD', 'month',  NULL, NULL, NULL, 14, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------
-- 2. SUBSCRIPTIONS (one active subscription per business)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status VARCHAR(30) NOT NULL DEFAULT 'trialing'
        CHECK (status IN ('trialing', 'active', 'past_due', 'trial_expired',
                          'suspended', 'cancelled')),
    trial_start_at TIMESTAMPTZ,
    trial_end_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,                      -- trial -> paid timestamp
    external_billing_id VARCHAR(255),              -- future PSP reference (Stripe, etc.)
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_business ON subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
-- Trial-expiry sweep (ops workflow) needs this partial index:
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end
    ON subscriptions(trial_end_at)
    WHERE status = 'trialing';

-- Only one non-cancelled subscription per business at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_active_business
    ON subscriptions(business_id)
    WHERE status <> 'cancelled';

DROP TRIGGER IF EXISTS trg_subscriptions_updated ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- ----------------------------------------------------------
-- 3. ENTITLEMENTS (denormalized limits resolved from plan;
--    allows per-tenant overrides during beta without editing plans)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    ai_responses_per_period INTEGER,
    max_staff_users INTEGER,
    max_locations INTEGER,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,   -- e.g. {"beta_features": true}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_entitlements_subscription UNIQUE (subscription_id)
);

DROP TRIGGER IF EXISTS trg_entitlements_updated ON entitlements;
CREATE TRIGGER trg_entitlements_updated
    BEFORE UPDATE ON entitlements
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- ----------------------------------------------------------
-- 4. USAGE COUNTERS (quota metering per billing period)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    metric VARCHAR(50) NOT NULL,                  -- 'ai_responses' | 'staff_users' | ...
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ,
    quantity BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_usage_subscription_metric_period
        UNIQUE (subscription_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_lookup
    ON usage_counters(subscription_id, metric, period_start DESC);

-- ----------------------------------------------------------
-- 5. FEATURE FLAGS (beta kill-switches; DB-driven so ops can
--    flip without a deploy)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,             -- e.g. 'public_beta_enabled'
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_percent INTEGER NOT NULL DEFAULT 100
        CHECK (rollout_percent BETWEEN 0 AND 100),
    allowed_business_ids UUID[] NOT NULL DEFAULT '{}',  -- allowlist override
    description TEXT,
    updated_by UUID,                              -- staff_users.id (audit trail)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_feature_flags_updated ON feature_flags;
CREATE TRIGGER trg_feature_flags_updated
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

INSERT INTO feature_flags (key, enabled, description) VALUES
    ('public_beta_enabled',     FALSE, 'Master switch: allow new self-serve trial signups'),
    ('signup_open',             FALSE, 'Expose POST /api/auth/signup endpoint'),
    ('trial_expiry_enforcement', FALSE, 'Block access when trial_end_at has passed'),
    ('ai_quota_enforcement',    FALSE, 'Reject AI responses once quota exhausted')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------
-- 6. BACKFILL: existing Garco business gets an active
--    'business' subscription so nothing breaks on deploy.
-- ----------------------------------------------------------
DO $$
DECLARE
    garco_id UUID;
    biz_plan UUID;
    sub_id UUID;
BEGIN
    SELECT id INTO garco_id FROM businesses WHERE slug = 'garco';
    IF garco_id IS NULL THEN
        RAISE NOTICE 'No garco business found; skipping subscription backfill';
        RETURN;
    END IF;

    SELECT id INTO biz_plan FROM plans WHERE code = 'business';

    INSERT INTO subscriptions (business_id, plan_id, status, current_period_start)
    VALUES (garco_id, biz_plan, 'active', NOW())
    ON CONFLICT DO NOTHING
    RETURNING id INTO sub_id;

    IF sub_id IS NOT NULL THEN
        INSERT INTO entitlements (subscription_id, ai_responses_per_period, max_staff_users, max_locations)
        VALUES (sub_id, NULL, NULL, NULL);
    END IF;
END $$;
