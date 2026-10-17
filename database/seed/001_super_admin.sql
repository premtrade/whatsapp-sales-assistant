-- Seed initial super_admin user
-- Run with: psql $DATABASE_URL -f database/seed/001_super_admin.sql
-- NOTE: migration 067 replaced the blanket UNIQUE(email) constraint with the
-- partial index uq_staff_users_email_active (non-deleted rows only), so
-- `ON CONFLICT (email)` no longer has a matching arbiter and fails with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Target the partial index by predicate instead.

INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, password_hash, business_id)
SELECT
  'OWNER-001',
  'Platform',
  'Owner',
  'owner@waflo.app',
  'super_admin',
  'active',
  'America/Jamaica',
  crypt('ChangeMeNow!123', gen_salt('bf', 10)),
  NULL
ON CONFLICT (email) WHERE deleted_at IS NULL DO UPDATE
SET role = 'super_admin',
    status = 'active',
    password_hash = EXCLUDED.password_hash,
    updated_at = NOW();

-- Verify
SELECT id, email, role, status FROM staff_users WHERE role = 'super_admin';

