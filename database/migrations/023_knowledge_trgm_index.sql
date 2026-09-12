-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : 3 (Stage 1)
-- File    : 023_knowledge_trgm_index.sql
-- Purpose : Trigram index that powers the relevance search in
--           Workflow 03 (pg_trgm similarity() over chunk_text).
--           000_extensions.sql did not install pg_trgm, so we
--           create the extension here (idempotent) and then the
--           GIN index that speeds similarity() ORDER BY ... LIMIT.
-- ==========================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_chunktext_trgm
    ON knowledge_chunks
    USING GIN (chunk_text gin_trgm_ops);

COMMIT;
