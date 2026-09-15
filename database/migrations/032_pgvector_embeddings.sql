-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : 4
-- File    : 032_pgvector_embeddings.sql
-- Purpose : Add pgvector embedding columns and HNSW indexes
--           to knowledge_chunks and memory_embeddings tables
--           for Qdrant -> pgvector migration
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- knowledge_chunks: add embedding column + HNSW index
-- ==========================================================

ALTER TABLE knowledge_chunks
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Existing installations may carry the wrong dimension from an earlier
-- partial run of this migration; coerce to the canonical 768-dim shape.
ALTER TABLE knowledge_chunks
ALTER COLUMN embedding TYPE vector(768);

COMMENT ON COLUMN knowledge_chunks.embedding IS
'768-dim vector embedding from Gemini gemini-embedding-001 (outputDimensionality=768)';

-- HNSW index for ANN cosine similarity search
-- 768 dims is well within pgvector's 2000-dim HNSW limit
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 24, ef_construction = 128);

-- ==========================================================
-- memory_embeddings: add embedding column + HNSW index
-- ==========================================================

ALTER TABLE memory_embeddings
ADD COLUMN IF NOT EXISTS embedding vector(768);

ALTER TABLE memory_embeddings
ALTER COLUMN embedding TYPE vector(768);

COMMENT ON COLUMN memory_embeddings.embedding IS
'768-dim vector embedding from Gemini gemini-embedding-001 (outputDimensionality=768)';

-- HNSW index for ANN cosine similarity search
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_embedding_hnsw
ON memory_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 24, ef_construction = 128);