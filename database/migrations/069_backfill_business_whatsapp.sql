-- Backfill WhatsApp identity columns on businesses for ALL tenants.
--
-- Migration 047 backfilled waha_session_name='default' only for the 'garco'
-- slug. Tenants created later (e.g. via signup) were left with
-- waha_session_name = NULL and whatsapp_phone = NULL, even though their
-- WhatsApp number lives in settings.whatsapp_phone_number.
--
-- The n8n "01 - Incoming WhatsApp Message" workflow resolves the tenant via
-- businesses.waha_session_name / businesses.whatsapp_phone. With NULLs the
-- match fails, business_id arrives empty at the AI Brain, and the assistant
-- loses the business name, timezone greeting AND the knowledge-base search
-- (the hybrid search requires a UUID businessId) - it then answers with
-- "I don't have specific service details in my current context".
--
-- This backfill makes the single-session (default) deployment resolve the
-- tenant for every existing business. Multi-tenant deployments should set a
-- unique waha_session_name per business afterwards.
SET search_path TO public;

UPDATE businesses
SET waha_session_name = COALESCE(waha_session_name, 'default'),
    whatsapp_phone = COALESCE(whatsapp_phone, (
        SELECT NULLIF(s.setting_value, '')
        FROM settings s
        WHERE s.business_id = businesses.id
          AND s.setting_key = 'whatsapp_phone_number'
        LIMIT 1
    )),
    updated_at = NOW()
WHERE waha_session_name IS NULL
   OR whatsapp_phone IS NULL;
