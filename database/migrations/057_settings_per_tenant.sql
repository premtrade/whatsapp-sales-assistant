-- ==========================================================
-- Migration 057: Make Settings Per-Tenant
-- File    : 057_settings_per_tenant.sql
-- Purpose : Allow same setting_key across tenants by adding
--           business_id and replacing global unique constraint
--           with per-tenant unique index.
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- 1. Add business_id column if missing
-- ==========================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'settings'
          AND column_name = 'business_id'
    ) THEN
        ALTER TABLE settings ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Backfill existing rows to the default business if any rows lack business_id.
DO $$
DECLARE
    default_business_id UUID;
BEGIN
    SELECT id INTO default_business_id FROM businesses WHERE slug = 'garco' LIMIT 1;
    IF default_business_id IS NULL THEN
        SELECT id INTO default_business_id FROM businesses ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF default_business_id IS NOT NULL THEN
        UPDATE settings SET business_id = default_business_id WHERE business_id IS NULL;
    END IF;
END $$;

-- ==========================================================
-- 2. Replace global UNIQUE(setting_key) with per-tenant index
-- ==========================================================

-- Drop the old global unique constraint if present.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE c.conname = 'settings_setting_key_key'
          AND t.relname = 'settings'
    ) THEN
        ALTER TABLE settings DROP CONSTRAINT settings_setting_key_key;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_settings_key;

-- Per-tenant uniqueness: same key can exist across different tenants,
-- but not twice within the same tenant. System-level rows
-- (business_id IS NULL) remain globally unique by key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_tenant_key
    ON settings(setting_key, business_id);

-- ==========================================================
-- 3. Indexes for tenant queries
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_settings_business
    ON settings(business_id);

CREATE INDEX IF NOT EXISTS idx_settings_business_system
    ON settings(business_id, is_system);

-- ==========================================================
-- 4. Comments
-- ==========================================================

COMMENT ON COLUMN settings.business_id IS
'Tenant this setting belongs to. NULL for global/system settings.';
