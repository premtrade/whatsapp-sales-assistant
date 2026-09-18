-- Reproduce the exact Workflow 03 retrieval for "What are your services?"
-- using the real HF embedding of that question would need the API; instead
-- test the trigram-only branch (has_vector=false path) and the threshold.
WITH q AS (SELECT 'What are your services?'::text AS msg, 'garco'::text AS slug)
SELECT kc.chunk_number, similarity(kc.chunk_text, q.msg) AS trigram,
       kc.embedding IS NOT NULL AS has_embedding,
       left(kc.chunk_text, 70) AS chunk
FROM knowledge_chunks kc
JOIN knowledge_documents kd ON kd.id = kc.document_id
CROSS JOIN q
WHERE kd.business_id = (SELECT id FROM businesses WHERE slug = q.slug)
ORDER BY trigram DESC
LIMIT 8;
