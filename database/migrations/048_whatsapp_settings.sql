-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : Phase 3 - WhatsApp Configuration Settings
-- File    : 048_whatsapp_settings.sql
-- Purpose : Add WhatsApp configuration settings
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- INSERT WHATSAPP SETTINGS
-- ==========================================================

INSERT INTO settings (setting_key, setting_value, data_type, description, is_system)
VALUES
  ('whatsapp_phone_number', '', 'string', 'WhatsApp Business phone number in E.164 format', true),
  ('whatsapp_business_id', '', 'string', 'WhatsApp Business Account ID', true),
  ('whatsapp_business_name', '', 'string', 'WhatsApp Business display name', true),
  ('whatsapp_webhook_url', '', 'string', 'Webhook URL for incoming WhatsApp messages', true),
  ('whatsapp_api_version', 'v18.0', 'string', 'WhatsApp Business API version', true),
  ('whatsapp_message_limit', '1000', 'integer', 'Daily message limit for WhatsApp Business API', true)
ON CONFLICT (setting_key) DO NOTHING;

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE settings IS
'Global application configuration including WhatsApp settings.';

COMMENT ON COLUMN settings.setting_key IS
'Unique configuration key.';

COMMENT ON COLUMN settings.setting_value IS
'Configuration value stored as text.';