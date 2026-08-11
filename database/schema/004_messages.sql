-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 004_messages.sql
-- Purpose : Stores every message exchanged
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS messages
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL,

    whatsapp_message_id VARCHAR(255),

    direction VARCHAR(20)
        NOT NULL
        CHECK (
            direction IN (
                'incoming',
                'outgoing'
            )
        ),

    sender_type VARCHAR(20)
        NOT NULL
        CHECK (
            sender_type IN (
                'customer',
                'ai',
                'staff',
                'system'
            )
        ),

    message_type VARCHAR(30)
        NOT NULL
        DEFAULT 'text'
        CHECK (
            message_type IN (
                'text',
                'image',
                'audio',
                'video',
                'document',
                'location',
                'contact',
                'sticker',
                'reaction'
            )
        ),

    text_body TEXT,

    media_url TEXT,

    mime_type VARCHAR(255),

    media_size BIGINT,

    caption TEXT,

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    delivered_at TIMESTAMPTZ,

    read_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE messages IS
'Stores every incoming and outgoing message.';

COMMENT ON COLUMN messages.whatsapp_message_id IS
'Unique identifier returned by WAHA / WhatsApp.';

COMMENT ON COLUMN messages.metadata IS
'Raw provider payload and future extensible metadata.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_direction
ON messages(direction);

CREATE INDEX IF NOT EXISTS idx_messages_sender
ON messages(sender_type);

CREATE INDEX IF NOT EXISTS idx_messages_type
ON messages(message_type);

CREATE INDEX IF NOT EXISTS idx_messages_created
ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id
ON messages(whatsapp_message_id);

CREATE INDEX IF NOT EXISTS idx_messages_metadata
ON messages
USING GIN(metadata);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_messages_updated
ON messages;

CREATE TRIGGER trg_messages_updated
BEFORE UPDATE
ON messages
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();