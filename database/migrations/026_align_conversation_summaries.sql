-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : 3 (Stage 2)
-- File    : 026_align_conversation_summaries.sql
-- Purpose : Reconcile an existing/deployed conversation_summaries table that
--           was created from an earlier draft shape (confidence, source — no
--           message_count / start_message_at / end_message_at / created_by)
--           to the committed 020 schema.
--           The table is expected to be empty at this stage, so a guarded drop
--           is safe. On a correctly-shaped DB this is a no-op.
-- ==========================================================

BEGIN;

-- ----------------------------------------------------------
-- Drop the draft shape only if it is present (has confidence
-- and lacks message_count). Fresh DBs boot the correct 020
-- shape and are never dropped here.
-- ----------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversation_summaries' AND column_name = 'confidence'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversation_summaries' AND column_name = 'message_count'
    ) THEN
        EXECUTE 'DROP TABLE conversation_summaries';
        RAISE NOTICE 'Dropped old-shape conversation_summaries; recreating per 020.';
    END IF;
END $$;

-- Commit should target the public schema explicitly
SET search_path TO public;

-- ----------------------------------------------------------
-- Committed 020 shape
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_summaries (
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

-- ----------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation
    ON conversation_summaries(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_created
    ON conversation_summaries(created_at DESC);

-- ----------------------------------------------------------
-- Trigger
-- ----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_conversation_summaries_updated
    ON conversation_summaries;

CREATE TRIGGER trg_conversation_summaries_updated
    BEFORE UPDATE
    ON conversation_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

COMMIT;