-- Provider-agnostic billing support.
--
-- Stripe is not available in Jamaica as a merchant country, so the platform
-- cannot assume Stripe collects the money. These changes make the payments
-- ledger and webhook processing independent of whichever provider is active.
--
-- 1. `payments.provider_payment_id` becomes uniquely indexed so a provider
--    reference can be used as an idempotency target. Previously the column
--    only had a plain index, which means `ON CONFLICT (provider_payment_id)`
--    raises 42P10 (no unique or exclusion constraint) and payment recording
--    fails at runtime.
--
-- 2. `billing_webhook_events` replaces the previous pattern of writing a fake
--    zero-amount row into `payments` to deduplicate Stripe webhook deliveries.
--    It is provider agnostic and keeps the payments ledger clean.

DELETE FROM payments a
USING payments b
WHERE a.id > b.id
  AND a.provider_payment_id IS NOT NULL
  AND a.provider_payment_id = b.provider_payment_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment_id
  ON payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_business
  ON billing_webhook_events (business_id, received_at DESC);

-- Manual (offline) payment requests. The customer is instructed to pay by
-- transfer; a platform owner confirms receipt, which activates the
-- subscription through the same billing event pipeline as any other provider.
CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  reference VARCHAR(40) NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','rejected','expired')),
  method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer',
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_business
  ON payment_requests (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status
  ON payment_requests (status, created_at DESC);
