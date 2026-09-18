\echo '=== ALL MESSAGES ==='
SELECT row_number() OVER (ORDER BY m.created_at) AS n,
       m.direction, m.sender_type, length(m.text_body) AS len, m.text_body
FROM messages m
ORDER BY m.created_at ASC;
