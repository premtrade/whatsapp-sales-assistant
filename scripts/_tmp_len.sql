SELECT length(text_body) AS len, text_body
FROM messages WHERE direction='outgoing' ORDER BY created_at DESC LIMIT 8;
