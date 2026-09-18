SELECT to_char(m.created_at, 'HH24:MI:SS') AS t,
       m.direction, m.sender_type, length(m.text_body) AS len, m.text_body
FROM messages m
ORDER BY m.created_at;

SELECT '--- appointments ---' AS section;
SELECT a.title, a.appointment_type, a.status, a.starts_at, a.created_at FROM appointments a;

SELECT '--- handoffs ---' AS section;
SELECT h.status, h.reason, h.notes, h.created_at FROM handoffs h;

SELECT '--- quotes ---' AS section;
SELECT quote_number, status, total, currency, created_at FROM quotes;
