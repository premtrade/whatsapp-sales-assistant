-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 008_appointments.sql
-- Purpose : Appointments
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS appointments
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contact_id UUID NOT NULL,

    conversation_id UUID,

    quote_id UUID,

    appointment_type VARCHAR(50)
        NOT NULL DEFAULT 'consultation'
        CHECK (
            appointment_type IN (
                'consultation',
                'site_visit',
                'installation',
                'follow_up',
                'delivery',
                'other'
            )
        ),

    status VARCHAR(20)
        NOT NULL DEFAULT 'scheduled'
        CHECK (
            status IN (
                'scheduled',
                'confirmed',
                'completed',
                'cancelled',
                'no_show'
            )
        ),

    title VARCHAR(255) NOT NULL,

    description TEXT,

    location TEXT,

    starts_at TIMESTAMPTZ NOT NULL,

    ends_at TIMESTAMPTZ NOT NULL,

    assigned_to UUID,

    reminder_sent BOOLEAN
        NOT NULL DEFAULT FALSE,

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_appointments_contact
        FOREIGN KEY (contact_id)
        REFERENCES contacts(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_appointments_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_appointments_quote
        FOREIGN KEY (quote_id)
        REFERENCES quotes(id)
        ON DELETE SET NULL
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE appointments IS
'Customer appointments, inspections and meetings.';

COMMENT ON COLUMN appointments.starts_at IS
'Appointment start date and time.';

COMMENT ON COLUMN appointments.ends_at IS
'Appointment end date and time.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_appointments_contact
ON appointments(contact_id);

CREATE INDEX IF NOT EXISTS idx_appointments_conversation
ON appointments(conversation_id);

CREATE INDEX IF NOT EXISTS idx_appointments_status
ON appointments(status);

CREATE INDEX IF NOT EXISTS idx_appointments_start
ON appointments(starts_at);

CREATE INDEX IF NOT EXISTS idx_appointments_quote
ON appointments(quote_id);

CREATE INDEX IF NOT EXISTS idx_appointments_metadata
ON appointments
USING GIN(metadata);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_appointments_updated
ON appointments;

CREATE TRIGGER trg_appointments_updated
BEFORE UPDATE
ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();