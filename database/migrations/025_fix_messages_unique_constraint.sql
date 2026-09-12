-- ============================================================
-- Fix: Add UNIQUE constraint to messages.whatsapp_message_id
-- Required for ON CONFLICT deduplication in Workflow 1
-- ============================================================

-- First, remove duplicates if any exist
DELETE FROM messages a
USING (
    SELECT MIN(ctid) as ctid, whatsapp_message_id
    FROM messages
    WHERE whatsapp_message_id IS NOT NULL
    GROUP BY whatsapp_message_id
    HAVING COUNT(*) > 1
) b
WHERE a.whatsapp_message_id = b.whatsapp_message_id
AND a.ctid <> b.ctid;

-- Add UNIQUE constraint
ALTER TABLE messages
ADD CONSTRAINT uq_messages_whatsapp_id UNIQUE (whatsapp_message_id);

-- Verify constraint exists
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'messages'::regclass
AND conname = 'uq_messages_whatsapp_id';