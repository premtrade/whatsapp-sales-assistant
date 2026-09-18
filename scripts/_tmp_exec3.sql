SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('execution_entity','execution_data') ORDER BY table_name, ordinal_position;