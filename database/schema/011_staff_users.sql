-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 011_staff_users.sql
-- Purpose : Staff Users
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS staff_users
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    employee_number VARCHAR(50) UNIQUE,

    first_name VARCHAR(100) NOT NULL,

    last_name VARCHAR(100) NOT NULL,

    display_name VARCHAR(200)
        GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,

    email CITEXT UNIQUE NOT NULL,

    password_hash VARCHAR(255) NOT NULL,

    phone VARCHAR(25),

    role VARCHAR(30)
        NOT NULL DEFAULT 'sales'
        CHECK (
            role IN (
                'admin',
                'manager',
                'sales',
                'support',
                'technician'
            )
        ),

    status VARCHAR(20)
        NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'inactive',
                'suspended'
            )
        ),

    timezone VARCHAR(100)
        NOT NULL DEFAULT 'America/Jamaica',

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE staff_users IS
'Business staff who interact with customers and AI conversations.';

COMMENT ON COLUMN staff_users.role IS
'Business role used for permissions and routing.';

COMMENT ON COLUMN staff_users.display_name IS
'Automatically generated full display name.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_staff_role
ON staff_users(role);

CREATE INDEX IF NOT EXISTS idx_staff_status
ON staff_users(status);

CREATE INDEX IF NOT EXISTS idx_staff_email
ON staff_users(email);

CREATE INDEX IF NOT EXISTS idx_staff_metadata
ON staff_users
USING GIN(metadata);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_staff_updated
ON staff_users;

CREATE TRIGGER trg_staff_updated
BEFORE UPDATE
ON staff_users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
