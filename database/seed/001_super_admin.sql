-- Seed initial super_admin user
-- Run with: psql $DATABASE_URL -f database/seed/001_super_admin.sql

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
WHERE NOT EXISTS (
  SELECT 1 FROM staff_users WHERE role = 'super_admin' AND email = 'owner@waflo.app'
);

-- Verify
SELECT id, email, role, status FROM staff_users WHERE role = 'super_admin';
