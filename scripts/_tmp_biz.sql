SELECT id, name, slug, status, coalesce(whatsapp_phone,'<null>') AS whatsapp_phone,
       coalesce(waha_session_name,'<null>') AS waha_session_name, coalesce(timezone,'<null>') AS tz
FROM businesses;

SELECT setting_key, setting_value FROM settings
WHERE business_id = (SELECT id FROM businesses WHERE slug='garco');

SELECT count(*) AS appointments FROM appointments;
SELECT count(*) AS customer_facts FROM customer_facts;
SELECT fact_key, fact_value FROM customer_facts;
