-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Migration: 025
-- File    : 025_messages_unique_wamid.sql
-- Purpose : Add UNIQUE constraint to messages.whatsapp_message_id
--           Required for ON CONFLICT deduplication in Workflow 01
-- ==========================================================

SET search_path TO public;

-- Drop old plain index first (we'll replace with unique constraint)
DROP INDEX IF EXISTS idx_messages_whatsapp_id;

-- Add the UNIQUE constraint (creates a unique index automatically)
ALTER TABLE messages
  ADD CONSTRAINT IF NOT EXISTS uq_messages_whatsapp_id
  UNIQUE (whatsapp_message_id);

-- Re-add named index for query performance (separate from the constraint)
-- The constraint itself creates an index, so this is optional but makes
-- explicit index naming consistent with the rest of the schema.
COMMENT ON CONSTRAINT uq_messages_whatsapp_id ON messages IS
'Prevents duplicate WAHA/WhatsApp message IDs from being inserted twice.
Required for ON CONFLICT (whatsapp_message_id) DO NOTHING in Workflow 01.';
