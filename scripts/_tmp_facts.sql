SELECT '--- customer_facts ---' AS s;
SELECT fact_key, fact_value, confidence, created_at FROM customer_facts ORDER BY created_at;

SELECT '--- audit_logs ---' AS s;
SELECT action, description, left(new_values::text, 120) AS new_vals, created_at
FROM audit_logs ORDER BY created_at DESC LIMIT 20;

SELECT '--- messages col type ---' AS s;
SELECT data_type, character_maximum_length FROM information_schema.columns
WHERE table_name='messages' AND column_name='text_body';
