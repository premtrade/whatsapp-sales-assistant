-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 009_knowledge_documents.sql
-- Purpose : Knowledge Base Documents
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS knowledge_documents
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title VARCHAR(255) NOT NULL,

    document_type VARCHAR(50)
        NOT NULL
        CHECK (
            document_type IN
            (
                'pdf',
                'docx',
                'txt',
                'html',
                'markdown',
                'website',
                'faq',
                'policy',
                'other'
            )
        ),

    source TEXT,

    file_name VARCHAR(255),

    mime_type VARCHAR(100),

    file_size BIGINT,

    checksum VARCHAR(128),

    language VARCHAR(10)
        NOT NULL DEFAULT 'en',

    status VARCHAR(20)
        NOT NULL DEFAULT 'pending'
        CHECK (
            status IN
            (
                'pending',
                'processing',
                'indexed',
                'failed',
                'archived'
            )
        ),

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

COMMENT ON TABLE knowledge_documents IS
'Master record for every document ingested into the AI knowledge base.';

COMMENT ON COLUMN knowledge_documents.status IS
'Current indexing state of the document.';

COMMENT ON COLUMN knowledge_documents.checksum IS
'Used to detect duplicate uploads.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_documents_title
ON knowledge_documents(title);

CREATE INDEX IF NOT EXISTS idx_documents_status
ON knowledge_documents(status);

CREATE INDEX IF NOT EXISTS idx_documents_type
ON knowledge_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_documents_checksum
ON knowledge_documents(checksum);

CREATE INDEX IF NOT EXISTS idx_documents_metadata
ON knowledge_documents
USING GIN(metadata);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_documents_updated
ON knowledge_documents;

CREATE TRIGGER trg_documents_updated
BEFORE UPDATE
ON knowledge_documents
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();