-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 003_conversations.sql
-- Purpose : Customer Conversations
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS conversations
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contact_id UUID NOT NULL,

    channel VARCHAR(30)
        NOT NULL
        DEFAULT 'whatsapp'
        CHECK (
            channel IN (
                'whatsapp',
                'telegram',
                'messenger',
                'webchat',
                'sms'
            )
        ),

    status VARCHAR(20)
        NOT NULL
        DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'waiting_customer',
                'waiting_agent',
                'closed',
                'archived'
            )
        ),

    assigned_to UUID,

    started_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    last_message_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    ended_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_conversations_contact
        FOREIGN KEY (contact_id)
        REFERENCES contacts(id)
        ON DELETE CASCADE
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE conversations IS
'Each customer may have multiple conversations over time.';

COMMENT ON COLUMN conversations.contact_id IS
'Reference to the customer.';

COMMENT ON COLUMN conversations.assigned_to IS
'Staff member handling the conversation (added later).';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_conversations_contact
ON conversations(contact_id);

-- One conversation per contact per channel; backs the ON CONFLICT
-- (contact_id, channel) upsert in n8n Workflow 01 (also added by
-- migration 049 for existing installations).
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_contact_channel
ON conversations(contact_id, channel);

CREATE INDEX IF NOT EXISTS idx_conversations_status
ON conversations(status);

CREATE INDEX IF NOT EXISTS idx_conversations_channel
ON conversations(channel);

CREATE INDEX IF NOT EXISTS idx_conversations_started
ON conversations(started_at);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message
ON conversations(last_message_at);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_conversations_updated
ON conversations;

CREATE TRIGGER trg_conversations_updated
BEFORE UPDATE
ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();