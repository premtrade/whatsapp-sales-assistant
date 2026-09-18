SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='customer_facts' ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='customer_facts'::regclass;
SELECT id, fact_key, fact_value, confidence, source FROM customer_facts ORDER BY updated_at DESC LIMIT 10;