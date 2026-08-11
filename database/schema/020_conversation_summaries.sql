-- ============================================================
-- 020_conversation_summaries.sql
-- WhatsApp Sales Assistant
-- AI Memory Layer
-- ============================================================

CREATE TABLE conversation_summaries (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    summary TEXT NOT NULL,

    message_count INTEGER
        NOT NULL
        DEFAULT 0,

    start_message_at TIMESTAMPTZ,

    end_message_at TIMESTAMPTZ,

    created_by TEXT
        NOT NULL
        DEFAULT 'ai'
        CHECK (
            created_by IN (
                'ai',
                'manual',
                'system'
            )
        ),

    created_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW()

);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_conversation_summaries_conversation
ON conversation_summaries(conversation_id);

CREATE INDEX idx_conversation_summaries_created
ON conversation_summaries(created_at DESC);

-- ============================================================
-- Trigger
-- ============================================================

CREATE TRIGGER trg_conversation_summaries_updated
BEFORE UPDATE
ON conversation_summaries
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();