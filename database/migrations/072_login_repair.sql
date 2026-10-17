-- ==========================================================
-- Migration 072: Login repair — staff auth columns, constraints,
-- owner seed compatibility, and tenant backfill
-- Purpose : `POST /api/auth/login` fails on databases that were
--           initialized before migrations 062-071 existed:
--           * login() selects `deleted_at` (added in 066) and
--             `business_id` (added in 045) — both missing on old DBs
--             -> every login 500s with "column does not exist".
--           * seed-super-admin.ts and seed/001_super_admin.sql use
--             `ON CONFLICT (email)` which no longer matches any unique
--             arbiter after 067 replaced the global email constraint
--             with partial index uq_staff_users_email_active
--             -> owner recovery fails.
--           * non-super_admin rows with NULL business_id are rejected
--             by login() with "not assigned to a business".
-- Idempotent: safe to run multiple times and on fresh databases.
-- ==========================================================

SET search_path TO public;

-- 1. Columns login() depends on ------------------------------------
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_staff_business'
      AND conrelid = 'public.staff_users'::regclass
  ) THEN
    ALTER TABLE staff_users ADD CONSTRAINT fk_staff_business
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_business ON staff_users(business_id);
CREATE INDEX IF NOT EXISTS idx_staff_deleted_at ON staff_users(deleted_at) WHERE deleted_at IS NULL;

-- 2. Role/status values login() and the owner seed depend on --------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_users_role_check') THEN
    ALTER TABLE staff_users DROP CONSTRAINT staff_users_role_check;
  END IF;
  ALTER TABLE staff_users ADD CONSTRAINT staff_users_role_check
    CHECK (role = ANY (ARRAY['super_admin'::varchar, 'admin'::varchar, 'manager'::varchar, 'sales'::varchar, 'support'::varchar, 'technician'::varchar]));
EXCEPTION WHEN OTHERS THEN
  -- Fresh initdb already created the constraint via 054; ignore.
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_users_status_check') THEN
    ALTER TABLE staff_users DROP CONSTRAINT staff_users_status_check;
  END IF;
  ALTER TABLE staff_users ADD CONSTRAINT staff_users_status_check
    CHECK (status = ANY (ARRAY['active'::varchar, 'inactive'::varchar, 'suspended'::varchar, 'invited'::varchar]));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Email/employee uniqueness expected by 067 ----------------------
-- Drop legacy global email constraint if it still exists (067 does this,
-- but old databases that never ran 067 still carry it, breaking the seed
-- upsert and blocking email reuse after soft-delete).
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_email_key;
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_employee_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_users_email_active
  ON staff_users (email)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_users_business_employee_number
  ON staff_users (business_id, employee_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_users_global_employee_number
  ON staff_users (employee_number)
  WHERE business_id IS NULL;

-- 4. Platform owner must stay global --------------------------------
UPDATE staff_users
SET business_id = NULL,
    updated_at = NOW()
WHERE role = 'super_admin'
  AND business_id IS NOT NULL;

-- 5. Backfill tenant-less staff onto the oldest active business -----
-- login() rejects non-super_admin rows with NULL business_id. Rows created
-- before multi-tenancy (or by scripts that omitted business_id) would
-- otherwise be permanently locked out.
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

-- 6. Recover the two login accounts ----------------------------------
-- premtrade12@yahoo.com was only ever a PGADMIN login (pgAdmin != app
-- login) and has no staff_users row at all. Create it as an admin on the
-- oldest active business. Both accounts get the temporary password
-- 'ChangeMeNow!123' — change immediately after logging in.
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

  -- Owner: revive + reset to a known temporary password.
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

  -- premtrade: revive (keeps password) and attach to a business...
  UPDATE staff_users
  SET role = 'admin',
      status = 'active',
      business_id = COALESCE(business_id, fallback_business_id),
      deleted_at = NULL,
      updated_at = NOW()
  WHERE LOWER(email::text) = 'premtrade12@yahoo.com';

  -- ...or create it with the temporary password if it never existed.
  INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, password_hash, business_id)
  SELECT 'EMP001', 'Prem', 'Trade', 'premtrade12@yahoo.com', 'admin', 'active',
         'America/Jamaica', crypt('ChangeMeNow!123', gen_salt('bf', 10)), fallback_business_id
  WHERE NOT EXISTS (SELECT 1 FROM staff_users WHERE LOWER(email::text) = 'premtrade12@yahoo.com');
END $$;

INSERT INTO schema_migrations (migration_name)
VALUES ('072_login_repair.sql')
ON CONFLICT (migration_name) DO NOTHING;
