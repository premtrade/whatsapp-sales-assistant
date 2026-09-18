SELECT kc.chunk_number, left(replace(kc.chunk_text, E'\n', ' | '), 260) AS chunk
FROM knowledge_chunks kc
JOIN knowledge_documents kd ON kd.id = kc.document_id
WHERE kd.business_id = (SELECT id FROM businesses WHERE slug = 'garco')
ORDER BY kd.title, kc.chunk_number;
