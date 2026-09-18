SELECT slug, name, status, waha_session_name, whatsapp_phone FROM businesses;
SELECT setting_key, left(setting_value::text, 60) AS val FROM settings ORDER BY setting_key;
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='appointments' ORDER BY ordinal_position;
