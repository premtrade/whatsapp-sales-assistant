-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 002_contacts.sql
-- Purpose : Customer / Contact Master
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS contacts
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    phone VARCHAR(25) NOT NULL UNIQUE,

    display_name VARCHAR(255),

    email CITEXT,

    company VARCHAR(255),

    source VARCHAR(50) NOT NULL DEFAULT 'whatsapp'
        CHECK (
            source IN (
                'whatsapp',
                'website',
                'facebook',
                'instagram',
                'referral',
                'manual',
                'other'
            )
        ),

    preferred_language VARCHAR(10)
        NOT NULL DEFAULT 'en',

    opt_in BOOLEAN
        NOT NULL DEFAULT TRUE,

    tags JSONB
        NOT NULL DEFAULT '[]'::jsonb,

    notes TEXT,

    status VARCHAR(20)
        NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'blocked',
                'archived'
            )
        ),

    first_seen_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    last_seen_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE contacts IS
'Master customer table. One row per customer.';

COMMENT ON COLUMN contacts.phone IS
'WhatsApp number stored in E.164 format.';

COMMENT ON COLUMN contacts.tags IS
'JSON array of customer labels.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_contacts_phone
    ON contacts(phone);

CREATE INDEX IF NOT EXISTS idx_contacts_email
    ON contacts(email);

CREATE INDEX IF NOT EXISTS idx_contacts_company
    ON contacts(company);

CREATE INDEX IF NOT EXISTS idx_contacts_status
    ON contacts(status);

CREATE INDEX IF NOT EXISTS idx_contacts_source
    ON contacts(source);

CREATE INDEX IF NOT EXISTS idx_contacts_created_at
    ON contacts(created_at);

CREATE INDEX IF NOT EXISTS idx_contacts_tags
    ON contacts
    USING GIN(tags);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_contacts_updated
ON contacts;

CREATE TRIGGER trg_contacts_updated
BEFORE UPDATE
ON contacts
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
