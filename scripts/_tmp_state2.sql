\echo '=== MESSAGES (authoritative) ==='
SELECT m.direction, m.sender_type, m.message_type,
       length(m.text_body) AS len, m.text_body
FROM messages m
ORDER BY m.created_at ASC;

\echo ''
\echo '=== BUSINESSES ==='
SELECT id, name, slug, status, whatsapp_phone, waha_session_name
FROM businesses;

\echo ''
\echo '=== SETTINGS (garco) ==='
SELECT setting_key, setting_value
FROM settings
WHERE business_id = (SELECT id FROM businesses WHERE slug='garco');

\echo ''
\echo '=== APPOINTMENTS ==='
SELECT count(*) AS appointments FROM appointments;
