-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : 3 (Stage 2)
-- File    : 025_align_memory_embeddings.sql
-- Purpose : Reconcile an existing/deployed memory_embeddings table that was
--           created from an earlier draft shape (source_table, no content /
--           embedding_status / embedded_at / metadata) to the committed 021
--           schema (source_type, content, embedding_status, embedded_at,
--           metadata). The table is empty at this stage, so a guarded drop is
--           safe. On a correctly-shaped DB this is a no-op.
-- ==========================================================

BEGIN;

-- Only drop if the *old draft* shape is present (has source_table). Fresh
-- databases boot the correct 021 shape and are never dropped here.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'memory_embeddings' AND column_name = 'source_table'
    ) THEN
        EXECUTE 'DROP TABLE memory_embeddings';
        RAISE NOTICE 'Dropped old-shape memory_embeddings; recreating per 021.';
    END IF;
END $$;

-- Committed 021 shape
CREATE TABLE IF NOT EXISTS memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contact_id UUID
        REFERENCES contacts(id)
        ON DELETE CASCADE,

    conversation_id UUID
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    source_type TEXT NOT NULL
        CHECK (source_type IN ('message', 'summary', 'fact', 'knowledge')),

    source_id UUID NOT NULL,

    content TEXT NOT NULL,

    embedding_model TEXT,

    embedding_status TEXT NOT NULL
        DEFAULT 'pending'
        CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),

    embedded_at TIMESTAMPTZ,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_contact
    ON memory_embeddings(contact_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_conversation
    ON memory_embeddings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_source
    ON memory_embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_status
    ON memory_embeddings(embedding_status);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_created
    ON memory_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_metadata
    ON memory_embeddings
    USING GIN(metadata);

DROP TRIGGER IF EXISTS trg_memory_embeddings_updated ON memory_embeddings;
CREATE TRIGGER trg_memory_embeddings_updated
    BEFORE UPDATE
    ON memory_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

COMMIT;
