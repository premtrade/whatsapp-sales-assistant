SELECT to_char(m.created_at AT TIME ZONE 'America/Jamaica','HH24:MI:SS') AS t,
       m.direction, m.sender_type, m.message_type,
       replace(m.text_body, E'\n', ' \\n ') AS text
FROM messages m
ORDER BY m.created_at;