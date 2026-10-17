-- ==========================================================
-- Recover platform-owner + tenant login access
-- Run with: psql $DATABASE_URL -f database/seed/002_recover_logins.sql
-- Purpose : one-shot repair for environments where
--           * owner@waflo.app exists but its bcrypt hash was seeded by an
--             incompatible hasher, or the row is inactive/soft-deleted, or
--           * premtrade12@yahoo.com was only ever a PGADMIN login (pgAdmin
--             != app login) and has no staff_users row at all.
-- What it does:
--   1. Ensures the login-repair columns/constraints exist (072 backstop).
--   2. Resets owner@waflo.app to super_admin/active with a known bcrypt
--      hash for 'ChangeMeNow!123' (change it immediately after login).
--   3. Creates premtrade12@yahoo.com as an admin on the oldest active
--      business with the same temporary password, if missing.
-- Idempotent: safe to run multiple times.
-- ==========================================================

SET search_path TO public;

-- Backstop in case migration 072 has not been applied yet.
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Temporary password for both recovered accounts: 'ChangeMeNow!123'.
-- The crypt() calls below generate a bcrypt ($2a$) hash in Postgres, which
-- bcryptjs verifies fine. Change the password immediately after logging in.

-- 1. Owner: revive + reset to a known temporary password.
UPDATE staff_users
SET role = 'super_admin',
    status = 'active',
    business_id = NULL,
    deleted_at = NULL,
    password_hash = crypt('ChangeMeNow!123', gen_salt('bf', 10)),
    updated_at = NOW()
WHERE LOWER(email::text) = 'owner@waflo.app';

INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, password_hash, business_id)
SELECT 'OWNER-001', 'Platform', 'Owner', 'owner@waflo.app', 'super_admin', 'active',
       'America/Jamaica', crypt('ChangeMeNow!123', gen_salt('bf', 10)), NULL
WHERE NOT EXISTS (SELECT 1 FROM staff_users WHERE LOWER(email::text) = 'owner@waflo.app');

-- 2. premtrade12@yahoo.com: attach to the oldest active business as admin.
DO $$
DECLARE
  fallback_business_id UUID;
BEGIN
  SELECT id INTO fallback_business_id
  FROM businesses
  WHERE deleted_at IS NULL AND status IN ('active', 'trialing', 'pending')
  ORDER BY created_at ASC
  LIMIT 1;

  IF fallback_business_id IS NULL THEN
    INSERT INTO businesses (name, slug, status)
    VALUES ('Recovered Business', 'recovered', 'active')
    RETURNING id INTO fallback_business_id;
  END IF;

  -- Revive an existing row (keeps its password) and attach it to a business.
  UPDATE staff_users
  SET role = 'admin',
      status = 'active',
      business_id = COALESCE(business_id, fallback_business_id),
      deleted_at = NULL,
      updated_at = NOW()
  WHERE LOWER(email::text) = 'premtrade12@yahoo.com';

  -- Or create it with the temporary password if it never existed.
  INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, password_hash, business_id)
  SELECT 'EMP001', 'Prem', 'Trade', 'premtrade12@yahoo.com', 'admin', 'active',
         'America/Jamaica', crypt('ChangeMeNow!123', gen_salt('bf', 10)), fallback_business_id
  WHERE NOT EXISTS (SELECT 1 FROM staff_users WHERE LOWER(email::text) = 'premtrade12@yahoo.com');
END $$;

-- 3. Any other tenant-less non-owner staff: attach to oldest active business.
DO $$
DECLARE
  fallback_business_id UUID;
BEGIN
  SELECT id INTO fallback_business_id
  FROM businesses
  WHERE deleted_at IS NULL AND status IN ('active', 'trialing', 'pending')
  ORDER BY created_at ASC
  LIMIT 1;

  IF fallback_business_id IS NOT NULL THEN
    UPDATE staff_users
    SET business_id = fallback_business_id,
        updated_at = NOW()
    WHERE role <> 'super_admin'
      AND business_id IS NULL
      AND deleted_at IS NULL;
  END IF;
END $$;

-- Verify
SELECT email, role, status, business_id, (password_hash IS NOT NULL) AS has_password
FROM staff_users
WHERE LOWER(email::text) IN ('owner@waflo.app', 'premtrade12@yahoo.com');
