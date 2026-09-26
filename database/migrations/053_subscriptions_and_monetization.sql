-- ==========================================================
-- Migration 053: Subscriptions and Monetization Foundation
-- File    : 053_subscriptions_and_monetization.sql
-- Purpose : Create plans, subscriptions, usage_records, and payments tables
--           Seed default plans matching marketing pricing tiers
-- ==========================================================

SET search_path TO public;

-- 1. Ensure businesses status constraint includes 'trialing'
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_status_check 
    CHECK (status IN ('active', 'inactive', 'suspended', 'pending', 'trialing'));

-- 2. PLANS TABLE
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    price_monthly NUMERIC(10,2) NOT NULL,
    price_yearly NUMERIC(10,2),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_slug ON plans(slug);
CREATE INDEX IF NOT EXISTS idx_plans_active_public ON plans(is_active, is_public);

DROP TRIGGER IF EXISTS trg_plans_updated ON plans;
CREATE TRIGGER trg_plans_updated
    BEFORE UPDATE ON plans
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- 3. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'trialing'
        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired', 'paused')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    trial_ends_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    grace_period_ends_at TIMESTAMPTZ,
    external_customer_id VARCHAR(255),
    external_subscription_id VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_business ON subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ends ON subscriptions(trial_ends_at) WHERE status = 'trialing';

DROP TRIGGER IF EXISTS trg_subscriptions_updated ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();


-- 4. USAGE RECORDS TABLE
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
    metric VARCHAR(50) NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    limit_value INTEGER,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_usage_business_metric_period UNIQUE (business_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_business ON usage_records(business_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_metric_period ON usage_records(metric, period_start, period_end);

DROP TRIGGER IF EXISTS trg_usage_records_updated ON usage_records;
CREATE TRIGGER trg_usage_records_updated
    BEFORE UPDATE ON usage_records
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- 5. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'disputed')),
    provider VARCHAR(50) NOT NULL DEFAULT 'stripe',
    provider_payment_id VARCHAR(255),
    provider_customer_id VARCHAR(255),
    method VARCHAR(50),
    failure_reason TEXT,
    idempotency_key VARCHAR(255) UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON payments(provider_payment_id);

DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- 6. SEED DEFAULT PLANS
INSERT INTO plans (name, slug, price_monthly, price_yearly, currency, features, limits, sort_order, is_active, is_public)
VALUES
(
    'Starter',
    'starter',
    79.00,
    750.00,
    'USD',
    '{"ai_responses": true, "pdf_quotes": false, "appointments": false, "lead_scoring": true, "knowledge_base": true, "handoffs": true, "multi_location": false, "api_access": false}'::jsonb,
    '{"ai_responses": 500, "staff_users": 1, "locations": 1, "whatsapp_numbers": 1}'::jsonb,
    1,
    TRUE,
    TRUE
),
(
    'Professional',
    'professional',
    199.00,
    1900.00,
    'USD',
    '{"ai_responses": true, "pdf_quotes": true, "appointments": true, "lead_scoring": true, "knowledge_base": true, "handoffs": true, "multi_location": true, "api_access": false}'::jsonb,
    '{"ai_responses": 2000, "staff_users": 5, "locations": 3, "whatsapp_numbers": 1}'::jsonb,
    2,
    TRUE,
    TRUE
),
(
    'Business',
    'business',
    399.00,
    3800.00,
    'USD',
    '{"ai_responses": true, "pdf_quotes": true, "appointments": true, "lead_scoring": true, "knowledge_base": true, "handoffs": true, "multi_location": true, "api_access": true}'::jsonb,
    '{"ai_responses": -1, "staff_users": -1, "locations": -1, "whatsapp_numbers": -1}'::jsonb,
    3,
    TRUE,
    TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- 7. BACKFILL EXISTING BUSINESSES WITH TRIAL OR ACTIVE SUBSCRIPTIONS
DO $$
DECLARE
    starter_plan_id UUID;
    prof_plan_id UUID;
    biz RECORD;
BEGIN
    SELECT id INTO starter_plan_id FROM plans WHERE slug = 'starter' LIMIT 1;
    SELECT id INTO prof_plan_id FROM plans WHERE slug = 'professional' LIMIT 1;

    FOR biz IN SELECT id, slug, status, created_at FROM businesses WHERE deleted_at IS NULL LOOP
        IF NOT EXISTS (SELECT 1 FROM subscriptions WHERE business_id = biz.id) THEN
            IF biz.slug = 'garco' THEN
                INSERT INTO subscriptions (
                    business_id, plan_id, status, current_period_start, current_period_end, metadata
                ) VALUES (
                    biz.id,
                    COALESCE(prof_plan_id, starter_plan_id),
                    'active',
                    NOW(),
                    NOW() + INTERVAL '10 years',
                    '{"notes": "Primary seed tenant grandfathered"}'::jsonb
                );
            ELSE
                INSERT INTO subscriptions (
                    business_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, metadata
                ) VALUES (
                    biz.id,
                    starter_plan_id,
                    'trialing',
                    NOW(),
                    NOW() + INTERVAL '14 days',
                    NOW() + INTERVAL '14 days',
                    '{"notes": "Automatic trial initialized"}'::jsonb
                );
            END IF;
        END IF;
    END LOOP;
END $$;
