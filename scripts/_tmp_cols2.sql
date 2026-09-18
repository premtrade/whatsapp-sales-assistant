SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_name IN ('messages','appointments','handoffs','quotes','conversations')
GROUP BY table_name;
