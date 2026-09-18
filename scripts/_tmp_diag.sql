-- 1. What the AI actually stored vs what it sent
SELECT direction, sender_type, length(text_body) AS len, text_body, to_char(created_at,'HH24:MI:SS') AS t
FROM messages
ORDER BY created_at
LIMIT 40;

-- 2. Event types hitting workflow 01 (why 115 executions?)
SELECT new_values->>'event' AS event,
       count(*) AS n,
       count(DISTINCT new_values->>'phone') AS phones
FROM audit_logs
WHERE action = 'message_received'
GROUP BY 1 ORDER BY n DESC;

-- 3. Sample of the non-message events
SELECT left(new_values->>'phone', 40) AS phone, count(*) AS n
FROM audit_logs
WHERE action = 'message_received'
GROUP BY 1 ORDER BY n DESC LIMIT 10;

-- 4. Knowledge chunk metadata (is there an internal flag?)
SELECT kc.chunk_number, kc.metadata::text AS meta, left(kc.chunk_text, 55) AS head
FROM knowledge_chunks kc
JOIN knowledge_documents kd ON kd.id = kc.document_id
WHERE kd.business_id = (SELECT id FROM businesses WHERE slug='garco')
  AND kc.chunk_number > 0
ORDER BY kc.chunk_number;
