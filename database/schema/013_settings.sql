-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 013_settings.sql
-- Purpose : Application Settings
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS settings
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    setting_key VARCHAR(100)
        NOT NULL UNIQUE,

    setting_value TEXT,

    data_type VARCHAR(20)
        NOT NULL DEFAULT 'string'
        CHECK (
            data_type IN
            (
                'string',
                'integer',
                'decimal',
                'boolean',
                'json'
            )
        ),

    description TEXT,

    is_system BOOLEAN
        NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE settings IS
'Global application configuration.';

COMMENT ON COLUMN settings.setting_key IS
'Unique configuration key.';

COMMENT ON COLUMN settings.setting_value IS
'Configuration value stored as text.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_settings_key
ON settings(setting_key);

CREATE INDEX IF NOT EXISTS idx_settings_system
ON settings(is_system);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_settings_updated
ON settings;

CREATE TRIGGER trg_settings_updated
BEFORE UPDATE
ON settings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();