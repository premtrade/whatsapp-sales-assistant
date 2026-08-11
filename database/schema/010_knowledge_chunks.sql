-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 010_knowledge_chunks.sql
-- Purpose : Document Chunks for RAG
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS knowledge_chunks
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    document_id UUID NOT NULL,

    chunk_number INTEGER NOT NULL,

    chunk_text TEXT NOT NULL,

    token_count INTEGER,

    embedding_model VARCHAR(100),

    qdrant_point_id UUID,

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_chunks_document
        FOREIGN KEY (document_id)
        REFERENCES knowledge_documents(id)
        ON DELETE CASCADE,

    -- Prevent duplicate chunks during re-indexing
    CONSTRAINT uq_chunks_document_chunk
        UNIQUE (document_id, chunk_number)
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE knowledge_chunks IS
'Individual text chunks extracted from documents for RAG.';

COMMENT ON COLUMN knowledge_chunks.chunk_number IS
'Sequential chunk number within a document.';

COMMENT ON COLUMN knowledge_chunks.qdrant_point_id IS
'UUID of the corresponding vector stored in Qdrant.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_chunks_document
ON knowledge_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_chunks_number
ON knowledge_chunks(chunk_number);

CREATE INDEX IF NOT EXISTS idx_chunks_qdrant
ON knowledge_chunks(qdrant_point_id);

CREATE INDEX IF NOT EXISTS idx_chunks_model
ON knowledge_chunks(embedding_model);

CREATE INDEX IF NOT EXISTS idx_chunks_metadata
ON knowledge_chunks
USING GIN(metadata);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_chunks_updated
ON knowledge_chunks;

CREATE TRIGGER trg_chunks_updated
BEFORE UPDATE
ON knowledge_chunks
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();