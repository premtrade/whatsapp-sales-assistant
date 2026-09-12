-- ==========================================================
-- Retry Queue for failed outgoing WhatsApp messages
-- ==========================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS waha_retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    text_body TEXT,
    media_url TEXT,
    mime_type VARCHAR(100),
    caption TEXT,
    chat_id VARCHAR(255) NOT NULL,
    session VARCHAR(100) NOT NULL DEFAULT 'default',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waha_retry_queue_next_retry
ON waha_retry_queue(next_retry_at);

CREATE INDEX IF NOT EXISTS idx_waha_retry_queue_status
ON waha_retry_queue(status);

CREATE INDEX IF NOT EXISTS idx_waha_retry_queue_conversation
ON waha_retry_queue(conversation_id);

DROP TRIGGER IF EXISTS trg_waha_retry_queue_updated ON waha_retry_queue;

CREATE TRIGGER trg_waha_retry_queue_updated
BEFORE UPDATE
ON waha_retry_queue
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
