-- Scheduled cancellation.
--
-- Lets a customer cancel their subscription themselves from the Billing page
-- without losing access for the period they have already paid for. Offline
-- billing has no provider to schedule a cancellation with, so the intent is
-- recorded on the subscription and applied by the billing lifecycle.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_at
  ON subscriptions (cancel_at_period_end)
  WHERE cancel_at_period_end IS NOT NULL;
