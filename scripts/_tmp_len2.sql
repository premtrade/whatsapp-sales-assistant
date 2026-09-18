SELECT m.direction,
       length(m.text_body) AS len,
       m.text_body
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE c.contact_id = '50e551ea-93bc-4f1f-a6c4-cd11a8161def'
  AND m.direction = 'outgoing'
ORDER BY m.created_at;

SELECT data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name='messages' AND column_name='text_body';