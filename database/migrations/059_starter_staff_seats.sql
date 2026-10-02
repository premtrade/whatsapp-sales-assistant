-- =============================================================================
-- 059: Raise the Starter plan's staff seat limit
-- =============================================================================
-- The Starter plan seeded with staff_users: 1, which makes the Staff tab's
-- "Add Staff Member" fail with 402 "Staff seats full (1/1)" as soon as the
-- first seat is taken (the account itself counts). Raise Starter to 5 seats —
-- matching Professional — so trial tenants can onboard teammates.
-- Idempotent: only rewrites rows that are not already at 5.

UPDATE plans
SET limits = limits || '{"staff_users": 5}'::jsonb
WHERE slug = 'starter'
  AND (limits ->> 'staff_users') IS DISTINCT FROM '5';
