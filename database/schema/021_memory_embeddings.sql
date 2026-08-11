-- ============================================================
-- 021_memory_embeddings.sql
-- WhatsApp Sales Assistant
-- AI Memory Layer
-- ============================================================

CREATE TABLE memory_embeddings (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contact_id UUID
        REFERENCES contacts(id)
        ON DELETE CASCADE,

    conversation_id UUID
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    source_type TEXT NOT NULL
        CHECK (
            source_type IN (
                'message',
                'summary',
                'fact',
                'knowledge'
            )
        ),

    source_id UUID NOT NULL,

    content TEXT NOT NULL,

    embedding_model TEXT,

    embedding_status TEXT NOT NULL
        DEFAULT 'pending'
        CHECK (
            embedding_status IN (
                'pending',
                'processing',
                'completed',
                'failed'
            )
        ),

    embedded_at TIMESTAMPTZ,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

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

CREATE INDEX idx_memory_embeddings_contact
ON memory_embeddings(contact_id);

CREATE INDEX idx_memory_embeddings_conversation
ON memory_embeddings(conversation_id);

CREATE INDEX idx_memory_embeddings_source
ON memory_embeddings(source_type, source_id);

CREATE INDEX idx_memory_embeddings_status
ON memory_embeddings(embedding_status);

CREATE INDEX idx_memory_embeddings_created
ON memory_embeddings(created_at DESC);

-- ============================================================
-- JSON Metadata Index
-- ============================================================

CREATE INDEX idx_memory_embeddings_metadata
ON memory_embeddings
USING GIN(metadata);

-- ============================================================
-- Trigger
-- ============================================================

CREATE TRIGGER trg_memory_embeddings_updated
BEFORE UPDATE
ON memory_embeddings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();