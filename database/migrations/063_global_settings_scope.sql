-- Keep platform-wide settings unique and separate from tenant settings.
-- Migration 057 moved existing settings onto a business; only settings explicitly
-- created with business_id NULL are visible in the platform owner's Global Settings.
SET search_path TO public;

CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_global_key
    ON settings(setting_key)
    WHERE business_id IS NULL;

INSERT INTO schema_migrations (migration_name)
VALUES ('063_global_settings_scope')
ON CONFLICT (migration_name) DO NOTHING;
