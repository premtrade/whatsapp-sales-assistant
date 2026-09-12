-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : 4
-- File    : 034_dummy_knowledge_chunk.sql
-- Purpose : Seed a dummy knowledge document + chunk so the
--           vector store always returns at least one result
--           and the RAG workflow never gets stuck on an empty
--           knowledge base.
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- 1. Create a dummy parent document (idempotent)
-- ==========================================================

INSERT INTO knowledge_documents (
    title,
    document_type,
    source,
    file_name,
    mime_type,
    status,
    language,
    metadata
)
SELECT
    '__dummy_fallback__',
    'other',
    'system://dummy',
    '__dummy_fallback__.txt',
    'text/plain',
    'indexed',
    'en',
    '{"is_dummy": true, "purpose": "vector_store_fallback"}'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM knowledge_documents WHERE title = '__dummy_fallback__'
);

-- ==========================================================
-- 2. Create the dummy chunk linked to that document
--    (idempotent: only inserts if no dummy chunk exists yet)
-- ==========================================================

INSERT INTO knowledge_chunks (
    document_id,
    chunk_number,
    chunk_text,
    token_count,
    embedding_model,
    metadata
)
SELECT
    d.id,
    0,
    'dummy content - fallback knowledge chunk used to ensure the vector store always returns at least one result.',
    12,
    'fallback',
    '{"is_dummy": true, "purpose": "vector_store_fallback"}'::jsonb
FROM knowledge_documents d
WHERE d.title = '__dummy_fallback__'
  AND NOT EXISTS (
      SELECT 1
      FROM knowledge_chunks kc
      WHERE kc.document_id = d.id
        AND kc.chunk_number = 0
  );

-- ==========================================================
-- 3. Populate a zero-vector embedding (768-dim) for the
--    dummy chunk so pgvector similarity search returns it
--    even when no other chunks match.
-- ==========================================================

UPDATE knowledge_chunks
SET embedding = array_fill(0.0, ARRAY[768])::vector
WHERE metadata->>'is_dummy' = 'true'
  AND embedding IS NULL;

-- ==========================================================
-- 4. Verification
-- ==========================================================

-- Should return at least one row after this migration runs.
SELECT
    kc.id            AS chunk_id,
    kd.title         AS document_title,
    kc.chunk_number,
    LEFT(kc.chunk_text, 60) AS chunk_preview,
    kc.embedding IS NOT NULL AS has_embedding,
    kc.embedding_model
FROM knowledge_chunks kc
JOIN knowledge_documents kd ON kd.id = kc.document_id
WHERE kc.metadata->>'is_dummy' = 'true';
