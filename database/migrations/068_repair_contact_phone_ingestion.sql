-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- File    : 068_repair_contact_phone_ingestion.sql
-- Purpose : Repair contacts damaged by WAHA ingestion bugs.
--
-- Root causes addressed:
--   1. The n8n "01 - Incoming WhatsApp Message" workflow extracted the
--      customer phone only from `payload.from`. When WAHA changed its
--      webhook shape (or events arrived without `from`), an empty string
--      was upserted into contacts.phone, so the Inbox and Customers pages
--      rendered blank phone cells. Empty-string rows are now deleted
--      (their messages/conversations cascade away with them).
--   2. Rows whose phone was stored as a bare "@s.whatsapp.net" chat id or
--      with a leading "+" are normalized to digits-only E.164-style values.
--   3. Legacy rows created before multi-tenancy (migration 045) that still
--      have NULL business_id are backfilled from their conversation so the
--      tenant-scoped API queries return them again.
--   4. A CHECK constraint prevents empty / whitespace-only phones from ever
--      being written again (fail-fast surfaces the bug in n8n execution
--      logs instead of silently blanking the UI).
-- ==========================================================

SET search_path TO public;

BEGIN;

-- ------------------------------------------------------------
-- 1. Normalize malformed phone values (chat-id suffixes, '+', spaces).
-- ------------------------------------------------------------
UPDATE contacts
SET phone = regexp_replace(replace(phone, '@s.whatsapp.net', ''), '[^0-9]', '', 'g'),
    updated_at = NOW()
WHERE phone <> regexp_replace(replace(phone, '@s.whatsapp.net', ''), '[^0-9]', '', 'g');

-- ------------------------------------------------------------
-- 2. Delete rows left by failed extraction (empty / placeholder phones).
--    Conversations/messages cascade via FK; quotes and appointments
--    reference contacts with ON DELETE RESTRICT, so detach them first
--    (they are unusable without a valid customer identity anyway).
-- ------------------------------------------------------------
CREATE TEMP TABLE bad_contacts ON COMMIT DROP AS
SELECT id FROM contacts
WHERE btrim(coalesce(phone, '')) = ''
   OR phone ~ '^[+@[:space:]]*$';

UPDATE quotes q
SET contact_id = NULL
FROM bad_contacts b
WHERE q.contact_id = b.id;

UPDATE appointments a
SET contact_id = NULL
FROM bad_contacts b
WHERE a.contact_id = b.id;

DELETE FROM messages m
USING conversations cv
WHERE m.conversation_id = cv.id
  AND cv.contact_id IN (SELECT id FROM bad_contacts);

DELETE FROM conversations cv
WHERE cv.contact_id IN (SELECT id FROM bad_contacts);

DELETE FROM contacts c
WHERE c.id IN (SELECT id FROM bad_contacts);

-- ------------------------------------------------------------
-- 3. Backfill NULL business_id on surviving contacts from their
--    most recent conversation (tenant-scoped reads filter on
--    business_id, so these rows were invisible in the UI).
-- ------------------------------------------------------------
WITH src AS (
    SELECT DISTINCT ON (cv.contact_id) cv.contact_id, cv.business_id
    FROM conversations cv
    WHERE cv.business_id IS NOT NULL
    ORDER BY cv.contact_id, cv.last_message_at DESC NULLS LAST
)
UPDATE contacts c
SET business_id = src.business_id
FROM src
WHERE c.id = src.contact_id
  AND c.business_id IS NULL;

-- Any contact still without a tenant cannot be shown safely in a
-- per-tenant list; drop the orphans (they have no conversations left
-- after step 2 cascades).
DELETE FROM contacts
WHERE business_id IS NULL
  AND id NOT IN (SELECT contact_id FROM conversations WHERE contact_id IS NOT NULL);

-- ------------------------------------------------------------
-- 4. Guard against regressions: phones must never be empty again.
-- ------------------------------------------------------------
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_not_blank;
ALTER TABLE contacts
    ADD CONSTRAINT contacts_phone_not_blank
    CHECK (btrim(coalesce(phone, '')) <> '');

COMMIT;
