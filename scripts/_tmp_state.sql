SELECT m.direction, m.sender_type, left(m.text_body, 120) AS text,
       to_char(m.created_at AT TIME ZONE 'America/Jamaica', 'MM-DD HH24:MI') AS t
FROM messages m
ORDER BY m.created_at DESC
LIMIT 30;

SELECT a.title, a.appointment_type, a.status, a.starts_at, a.ends_at, a.created_at
FROM appointments a
ORDER BY a.created_at DESC
LIMIT 10;

SELECT count(*) AS total_chunks,
       count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
FROM knowledge_chunks;
