-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 012_handoffs.sql
-- Purpose : AI → Human Conversation Handoffs
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS handoffs
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL,

    assigned_to UUID,

    requested_by VARCHAR(20)
        NOT NULL DEFAULT 'ai'
        CHECK (
            requested_by IN
            (
                'ai',
                'customer',
                'staff',
                'system'
            )
        ),

    reason VARCHAR(100)
        NOT NULL,

    notes TEXT,

    status VARCHAR(20)
        NOT NULL DEFAULT 'pending'
        CHECK (
            status IN
            (
                'pending',
                'accepted',
                'completed',
                'cancelled'
            )
        ),

    accepted_at TIMESTAMPTZ,

    completed_at TIMESTAMPTZ,

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_handoff_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE handoffs IS
'Tracks AI-to-human conversation transfers.';

COMMENT ON COLUMN handoffs.reason IS
'Reason why the handoff was requested.';

COMMENT ON COLUMN handoffs.assigned_to IS
'Staff member assigned to the conversation.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_handoff_conversation
ON handoffs(conversation_id);

CREATE INDEX IF NOT EXISTS idx_handoff_assigned
ON handoffs(assigned_to);

CREATE INDEX IF NOT EXISTS idx_handoff_status
ON handoffs(status);

CREATE INDEX IF NOT EXISTS idx_handoff_requested
ON handoffs(requested_by);

CREATE INDEX IF NOT EXISTS idx_handoff_metadata
ON handoffs
USING GIN(metadata);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_handoffs_updated
ON handoffs;

CREATE TRIGGER trg_handoffs_updated
BEFORE UPDATE
ON handoffs
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
