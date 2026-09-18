
SELECT 'bge_reembed' AS chk, embedding_model, (embedding IS NOT NULL) AS has_vec
FROM knowledge_chunks WHERE chunk_number = 1;
SELECT 'appointments' AS chk, count(*) AS n FROM appointments;
SELECT 'handoffs' AS chk, count(*) AS n FROM handoffs;
SELECT 'null_facts' AS chk, count(*) AS n FROM customer_facts WHERE lower(fact_key) IN ('null','undefined','') OR lower(fact_value) IN ('null','undefined','');
SELECT 'business_phone' AS chk, whatsapp_phone FROM businesses WHERE slug='garco';
SELECT 'valid_facts' AS chk, jsonb_agg(fact_key||':'||fact_value) FROM customer_facts WHERE fact_key IS NOT NULL AND fact_key NOT IN ('null','undefined','');




SELECT id, display_name, phone, last_seen_at FROM contacts ORDER BY created_at DESC LIMIT 5;
SELECT direction, length(text_body) AS len, left(text_body, 100) AS body FROM messages ORDER BY created_at DESC LIMIT 8;
SELECT metadata FROM messages WHERE direction='incoming' ORDER BY created_at DESC LIMIT 1;
SELECT count(*) AS total FROM messages;