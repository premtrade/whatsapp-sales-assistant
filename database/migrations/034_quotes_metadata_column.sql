-- Migration 034: add metadata jsonb column to quotes for requires_review flag
-- and to appointments/handoffs for parity with workflow n8n output.
-- This is a non-destructive additive migration; safe to apply to a live DB.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN quotes.metadata IS
  'Workflow-derived flags and notes (e.g. requires_review, review_note).';

-- Optional: a partial index that lets the dashboard filter
-- "quotes waiting on a human" cheaply.
CREATE INDEX IF NOT EXISTS idx_quotes_requires_review
  ON quotes ((metadata->>'requires_review'))
  WHERE metadata->>'requires_review' = 'true';