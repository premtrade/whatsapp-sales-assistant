-- Repair installations where 032_pgvector_embeddings.sql was recorded in
-- schema_migrations by the legacy baseline but the columns were never added.
-- This migration is intentionally idempotent so it can safely reconcile both
-- partially initialized and fully initialized databases.

SET search_path TO public;

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(768);

ALTER TABLE knowledge_chunks
  ALTER COLUMN embedding TYPE vector(768);

COMMENT ON COLUMN knowledge_chunks.embedding IS
  '768-dim vector embedding from Gemini gemini-embedding-001 (outputDimensionality=768)';

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 24, ef_construction = 128);

ALTER TABLE memory_embeddings
  ADD COLUMN IF NOT EXISTS embedding vector(768);

ALTER TABLE memory_embeddings
  ALTER COLUMN embedding TYPE vector(768);

COMMENT ON COLUMN memory_embeddings.embedding IS
  '768-dim vector embedding from Gemini gemini-embedding-001 (outputDimensionality=768)';

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_embedding_hnsw
  ON memory_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 24, ef_construction = 128);
