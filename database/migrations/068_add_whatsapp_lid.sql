-- ==========================================================
-- 068_add_whatsapp_lid.sql
-- Purpose: store WAHA WhatsApp LID (@lid) separately from the real
-- phone number (@c.us). WEBJS engine sends payload.from as
-- "<lid>@lid" for privacy; the real phone lives in fromAlt /
-- participantAlt / _data or via GET /api/{session}/lids/{lid}.
-- Without this, contacts.phone gets filled with LID digits (e.g.
-- 251294258356378) and the inbox shows the same number twice.
-- ==========================================================

SET search_path TO public;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS wa_lid VARCHAR(64);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS wa_chat_id VARCHAR(64);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_contacts_wa_lid ON contacts(wa_lid);
CREATE INDEX IF NOT EXISTS idx_contacts_wa_chat_id ON contacts(wa_chat_id);

COMMENT ON COLUMN contacts.wa_lid IS 'WhatsApp Linked ID (LID) digits without suffix, e.g. 251294258356378 for 251294258356378@lid. NULL when unknown.';
COMMENT ON COLUMN contacts.wa_chat_id IS 'Full WhatsApp chat JID to reply on, e.g. 251294258356378@lid or 2519xxxxxxx@c.us. Prefer this over phone@c.us for replies.';
COMMENT ON COLUMN contacts.phone_verified IS 'TRUE when phone holds a real verified phone number (not a LID). FALSE means phone may still hold LID digits pending resolution.';

-- Backfill: existing rows where phone holds a 15-digit LID-style value
-- (Ethiopian real mobiles are 12 digits starting 2519/2517; LIDs like
-- 251294258356378 are 15 digits). Mark them unverified and copy to wa_lid.
DO $$
BEGIN
  UPDATE contacts
  SET wa_lid = regexp_replace(phone, '\D', '', 'g'),
      wa_chat_id = regexp_replace(phone, '\D', '', 'g') || '@lid',
      phone_verified = FALSE
  WHERE wa_lid IS NULL
    AND length(regexp_replace(phone, '\D', '', 'g')) >= 14;
END $$;
