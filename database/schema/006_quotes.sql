-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 006_quotes.sql
-- Purpose : Quote Header
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS quotes
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    quote_number VARCHAR(20) NOT NULL UNIQUE,

    contact_id UUID NOT NULL,

    conversation_id UUID,

    status VARCHAR(20)
        NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'sent',
                'accepted',
                'rejected',
                'expired',
                'cancelled'
            )
        ),

    subtotal NUMERIC(12,2)
        NOT NULL DEFAULT 0.00,

    tax NUMERIC(12,2)
        NOT NULL DEFAULT 0.00,

    discount NUMERIC(12,2)
        NOT NULL DEFAULT 0.00,

    total NUMERIC(12,2)
        NOT NULL DEFAULT 0.00,

    currency VARCHAR(3)
        NOT NULL DEFAULT 'JMD',

    notes TEXT,

    valid_until DATE,

    created_by UUID,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_quotes_contact
        FOREIGN KEY (contact_id)
        REFERENCES contacts(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_quotes_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE SET NULL
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE quotes IS
'Quote header. Quote line items are stored in quote_items.';

COMMENT ON COLUMN quotes.quote_number IS
'Human-readable quote number (e.g. Q-2026-000001).';

COMMENT ON COLUMN quotes.status IS
'Current lifecycle status of the quotation.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_quotes_number
ON quotes(quote_number);

CREATE INDEX IF NOT EXISTS idx_quotes_contact
ON quotes(contact_id);

CREATE INDEX IF NOT EXISTS idx_quotes_conversation
ON quotes(conversation_id);

CREATE INDEX IF NOT EXISTS idx_quotes_status
ON quotes(status);

CREATE INDEX IF NOT EXISTS idx_quotes_created
ON quotes(created_at);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_quotes_updated
ON quotes;

CREATE TRIGGER trg_quotes_updated
BEFORE UPDATE
ON quotes
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();