-- ==========================================================
-- Migration 058: Make Message Templates Per-Tenant
-- File    : 058_message_templates_per_tenant.sql
-- Purpose : Allow same template name across tenants by adding
--           business_id and replacing global unique constraint
--           on name with per-tenant unique index.
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
          AND table_name = 'message_templates'
          AND column_name = 'business_id'
    ) THEN
        ALTER TABLE message_templates ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Backfill existing seeded templates to the default business.
DO $$
DECLARE
    default_business_id UUID;
BEGIN
    SELECT id INTO default_business_id FROM businesses WHERE slug = 'garco' LIMIT 1;
    IF default_business_id IS NULL THEN
        SELECT id INTO default_business_id FROM businesses ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF default_business_id IS NOT NULL THEN
        UPDATE message_templates SET business_id = default_business_id WHERE business_id IS NULL;
    END IF;
END $$;

-- ==========================================================
-- 2. Replace global UNIQUE(name) with per-tenant index
-- ==========================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE c.conname = 'message_templates_name_key'
          AND t.relname = 'message_templates'
    ) THEN
        ALTER TABLE message_templates DROP CONSTRAINT message_templates_name_key;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_message_templates_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_templates_tenant_name
    ON message_templates(business_id, name);

-- ==========================================================
-- 3. Indexes for tenant queries
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_message_templates_business
    ON message_templates(business_id);

CREATE INDEX IF NOT EXISTS idx_message_templates_business_category
    ON message_templates(business_id, category);

-- ==========================================================
-- 4. Comments
-- ==========================================================

COMMENT ON COLUMN message_templates.business_id IS
'Tenant this template belongs to. NULL for global/system templates.';
