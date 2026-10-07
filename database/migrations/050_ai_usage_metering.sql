-- ==========================================================
-- Beta/Trial Launch — Usage metering close-the-loop
-- File    : 050_ai_usage_metering.sql
-- Purpose : Dedupe ledger for metered AI responses (prevents
--           webhook retries from double-counting quota), a
--           'ai_outreach_enabled' kill-switch flag, and a
--           backfill of ai_responses counters from history so
--           quotas are accurate the moment enforcement is on.
-- Depends : 049_plans_subscriptions_entitlements.sql
-- ==========================================================

SET search_path TO public;

-- ----------------------------------------------------------
-- 0. lead_scores was missed by the multi-tenancy migration:
--    add business_id (backfilled via contacts) + index so the
--    tenant-scoped pipeline summary can filter safely.
-- ----------------------------------------------------------
ALTER TABLE lead_scores ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

UPDATE lead_scores ls
SET business_id = c.business_id
FROM contacts c
WHERE ls.business_id IS NULL
  AND c.id = ls.contact_id
  AND c.business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_scores_business ON lead_scores(business_id);

-- ----------------------------------------------------------
-- 1. usage_counter_events — idempotency ledger.
--    One row per (subscription, metric, external event key).
--    recordAiResponse() inserts the whatsapp_message_id here;
--    duplicate WAHA/webhook deliveries become no-ops.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_counter_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    metric VARCHAR(50) NOT NULL,
    dedupe_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_usage_event UNIQUE (subscription_id, metric, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_created
    ON usage_counter_events(created_at);

-- ----------------------------------------------------------
-- 2. Seed per-feature kill-switch for AI-generated outreach.
--    Enabled by default (existing behaviour); ops can flip it
--    OFF instantly to stop all AI sends during a beta incident.
-- ----------------------------------------------------------
INSERT INTO feature_flags (key, enabled, description) VALUES
    ('ai_outreach_enabled', TRUE, 'Master switch: allow AI-generated WhatsApp replies to be sent')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------
-- 3. Backfill usage_counters.ai_responses from history.
--    Counts outgoing AI/system messages per subscription for
--    the CURRENT billing period only (past periods are already
--    consumed and irrelevant to live quota checks). Also seeds
--    the dedupe ledger so re-running this migration — or
--    replaying those historical wamids — never double-counts.
--    Idempotent via ON CONFLICT DO NOTHING.
-- ----------------------------------------------------------
DO $$
DECLARE
    sub RECORD;
    period DATE;
    cnt INTEGER;
BEGIN
    FOR sub IN SELECT id, COALESCE(current_period_start, NOW()) AS cps FROM subscriptions LOOP
        period := date_trunc('month', sub.cps)::date;

        SELECT COUNT(*) INTO cnt
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.business_id = (SELECT business_id FROM subscriptions WHERE id = sub.id)
          AND m.direction = 'outgoing'
          AND m.sender_type IN ('ai', 'system')
          AND m.created_at >= period;

        IF cnt > 0 THEN
            INSERT INTO usage_counters (subscription_id, metric, period_start, quantity)
            VALUES (sub.id, 'ai_responses', period, cnt)
            ON CONFLICT (subscription_id, metric, period_start) DO NOTHING;

            INSERT INTO usage_counter_events (subscription_id, metric, dedupe_key)
            SELECT sub.id, 'ai_responses', m.whatsapp_message_id
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE c.business_id = (SELECT business_id FROM subscriptions WHERE id = sub.id)
              AND m.direction = 'outgoing'
              AND m.sender_type IN ('ai', 'system')
              AND m.whatsapp_message_id IS NOT NULL
              AND m.created_at >= period
            ON CONFLICT (subscription_id, metric, dedupe_key) DO NOTHING;
        END IF;
    END LOOP;
END $$;
