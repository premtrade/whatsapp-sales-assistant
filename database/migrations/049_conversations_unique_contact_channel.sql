-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Migration: 049
-- File    : 049_conversations_unique_contact_channel.sql
-- Purpose : Add UNIQUE constraint on conversations(contact_id, channel).
--           Required for ON CONFLICT (contact_id, channel) upsert in
--           Workflow 01 (conversation open/refresh per contact+channel).
--           One conversation per contact per channel is the intended model.
--           Idempotent: re-runs are no-ops.
-- ==========================================================

SET search_path TO public;

-- Defensive dedupe: keep only the most recent conversation per (contact_id, channel).
-- No-op when data is already unique.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY contact_id, channel
               ORDER BY last_message_at DESC, created_at DESC, id DESC
           ) AS rn
    FROM conversations
)
DELETE FROM conversations
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Unique index backing the ON CONFLICT (contact_id, channel) clause.
-- Replaces the plain idx_conversations_contact lookup index.
DROP INDEX IF EXISTS uq_conversations_contact_channel;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_contact_channel
ON conversations(contact_id, channel);

COMMENT ON INDEX uq_conversations_contact_channel IS
'One conversation per contact per channel. Backs the ON CONFLICT upsert in
n8n Workflow 01 and keeps conversation history consolidated per contact.';
