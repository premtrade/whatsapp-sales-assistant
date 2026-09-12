-- ==========================================================
-- Follow-up Queue for abandoned conversations and sequences
-- ==========================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS follow_up_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    template_key VARCHAR(50) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    sent_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_queue_conversation
ON follow_up_queue(conversation_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_queue_contact
ON follow_up_queue(contact_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_queue_scheduled
ON follow_up_queue(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_follow_up_queue_status
ON follow_up_queue(status);

DROP TRIGGER IF EXISTS trg_follow_up_queue_updated ON follow_up_queue;

CREATE TRIGGER trg_follow_up_queue_updated
BEFORE UPDATE
ON follow_up_queue
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
