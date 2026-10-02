-- ============================================================
-- Migration 060: Beta Access Control + Subscription Audit Logs
-- ============================================================
SET search_path TO public;

-- 1. BETA_INVITES TABLE
-- Supports email invites, domain invites (unlimited for that domain),
-- and promo codes with max_uses + expiry.
CREATE TABLE IF NOT EXISTS beta_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255),
    domain VARCHAR(255),
    token VARCHAR(255) NOT NULL UNIQUE,
    invite_type VARCHAR(20) NOT NULL DEFAULT 'email'
        CHECK (invite_type IN ('email', 'domain', 'promo')),
    max_uses INT NOT NULL DEFAULT 1,
    used_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES staff_users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_beta_invite_target CHECK (
        (invite_type = 'email' AND email IS NOT NULL) OR
        (invite_type = 'domain' AND domain IS NOT NULL) OR
        (invite_type = 'promo' AND token IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_beta_invites_token ON beta_invites(token);
CREATE INDEX IF NOT EXISTS idx_beta_invites_email ON beta_invites(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_beta_invites_domain ON beta_invites(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_beta_invites_expires ON beta_invites(expires_at) WHERE expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_beta_invites_updated ON beta_invites;
CREATE TRIGGER trg_beta_invites_updated
    BEFORE UPDATE ON beta_invites
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Seed a default promo code for internal beta testing.
-- Promo code: BETA2026 — unlimited uses, expires in 90 days.
INSERT INTO beta_invites (email, domain, token, invite_type, max_uses, expires_at, metadata)
VALUES (
    NULL,
    NULL,
    'BETA2026',
    'promo',
    999999,
    NOW() + INTERVAL '90 days',
    '{"description": "Default public beta promo code", "notes": "Remove or rotate after public launch"}'::jsonb
)
ON CONFLICT (token) DO NOTHING;

-- 2. BETA_REGISTRATIONS AUDIT TABLE
-- Records every signup attempt during beta for traceability and abuse detection.
CREATE TABLE IF NOT EXISTS beta_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    invite_token VARCHAR(255),
    invite_type VARCHAR(20),
    ip_address VARCHAR(45),
    user_agent TEXT,
    signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_beta_registrations_email ON beta_registrations(email);
CREATE INDEX IF NOT EXISTS idx_beta_registrations_business ON beta_registrations(business_id);
CREATE INDEX IF NOT EXISTS idx_beta_registrations_signed_up ON beta_registrations(signed_up_at);

-- 3. SUBSCRIPTION_EVENTS APPEND-ONLY LOG
-- Tracks every status transition for audit and debugging.
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    triggered_by VARCHAR(50) NOT NULL DEFAULT 'system',
    triggered_by_user_id UUID REFERENCES staff_users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON subscription_events(created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON subscription_events(event_type);

-- 4. PLAN_CHANGES AUDIT LOG
CREATE TABLE IF NOT EXISTS plan_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    from_plan_id UUID REFERENCES plans(id),
    to_plan_id UUID NOT NULL REFERENCES plans(id),
    changed_by VARCHAR(50) NOT NULL DEFAULT 'system',
    changed_by_user_id UUID REFERENCES staff_users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_changes_subscription ON plan_changes(subscription_id);
CREATE INDEX IF NOT EXISTS idx_plan_changes_created_at ON plan_changes(created_at);

-- 5. HELPER FUNCTIONS

-- Log a subscription event (idempotent guard by caller).
CREATE OR REPLACE FUNCTION log_subscription_event(
    p_subscription_id UUID,
    p_event_type VARCHAR(50),
    p_from_status VARCHAR(20) DEFAULT NULL,
    p_to_status VARCHAR(20) DEFAULT NULL,
    p_triggered_by VARCHAR(50) DEFAULT 'system',
    p_triggered_by_user_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO subscription_events (
        subscription_id, event_type, from_status, to_status,
        triggered_by, triggered_by_user_id, metadata
    ) VALUES (
        p_subscription_id, p_event_type, p_from_status, p_to_status,
        p_triggered_by, p_triggered_by_user_id, p_metadata
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Log a plan change.
CREATE OR REPLACE FUNCTION log_plan_change(
    p_subscription_id UUID,
    p_from_plan_id UUID DEFAULT NULL,
    p_to_plan_id UUID DEFAULT NULL,
    p_changed_by VARCHAR(50) DEFAULT 'system',
    p_changed_by_user_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
    DECLARE
        v_id UUID;
BEGIN
    INSERT INTO plan_changes (
        subscription_id, from_plan_id, to_plan_id,
        changed_by, changed_by_user_id, metadata
    ) VALUES (
        p_subscription_id, p_from_plan_id, p_to_plan_id,
        p_changed_by, p_changed_by_user_id, p_metadata
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- 6. ADDITIONAL INDEXES FOR PERFORMANCE
-- Composite index for the owner dashboard trial queries.
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_trial_ends
    ON subscriptions(status, trial_ends_at)
    WHERE status IN ('trialing', 'active', 'past_due');

-- Index for expireDueTrials batch job.
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_expiry
    ON subscriptions(trial_ends_at)
    WHERE status = 'trialing' AND trial_ends_at IS NOT NULL;
