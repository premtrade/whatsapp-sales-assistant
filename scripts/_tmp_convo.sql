SELECT to_char(m.created_at AT TIME ZONE 'America/Jamaica','HH24:MI:SS') AS t,
       m.direction, m.sender_type, left(m.text_body, 90) AS text
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE c.contact_id = '50e551ea-93bc-4f1f-a6c4-cd11a8161def'
ORDER BY m.created_at;

SELECT 'quotes' AS tbl, count(*) FROM quotes
UNION ALL SELECT 'appointments', count(*) FROM appointments
UNION ALL SELECT 'handoffs', count(*) FROM handoffs
UNION ALL SELECT 'customer_facts', count(*) FROM customer_facts
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;

SELECT fact_key, fact_value FROM customer_facts WHERE contact_id='50e551ea-93bc-4f1f-a6c4-cd11a8161def';