-- ============================================================
-- Migration 056: Enforce one active/trialing/past_due subscription per business
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_subscription_per_business
ON subscriptions(business_id)
WHERE status IN ('trialing', 'active', 'past_due');
