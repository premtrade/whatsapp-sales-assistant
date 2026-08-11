-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 007_quote_items.sql
-- Purpose : Quote Line Items
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS quote_items
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    quote_id UUID NOT NULL,

    product_id UUID NOT NULL,

    line_number INTEGER NOT NULL,

    description TEXT,

    quantity NUMERIC(12,2)
        NOT NULL DEFAULT 1.00,

    unit VARCHAR(50)
        NOT NULL DEFAULT 'each',

    unit_price NUMERIC(12,2)
        NOT NULL DEFAULT 0.00,

    tax_rate NUMERIC(5,2)
        NOT NULL DEFAULT 0.00,

    discount NUMERIC(12,2)
        NOT NULL DEFAULT 0.00,

    line_total NUMERIC(12,2)
        NOT NULL DEFAULT 0.00,

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_quote_items_quote
        FOREIGN KEY (quote_id)
        REFERENCES quotes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_quote_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON DELETE RESTRICT,

    -- Each line number must be unique within a quote
    CONSTRAINT uq_quote_items_line
        UNIQUE (quote_id, line_number)
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE quote_items IS
'Individual line items belonging to a quotation.';

COMMENT ON COLUMN quote_items.line_number IS
'Display order of items on the quotation.';

COMMENT ON COLUMN quote_items.line_total IS
'Calculated total for this line item.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_quote_items_quote
ON quote_items(quote_id);

CREATE INDEX IF NOT EXISTS idx_quote_items_product
ON quote_items(product_id);

CREATE INDEX IF NOT EXISTS idx_quote_items_line
ON quote_items(line_number);

CREATE INDEX IF NOT EXISTS idx_quote_items_metadata
ON quote_items
USING GIN(metadata);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_quote_items_updated
ON quote_items;

CREATE TRIGGER trg_quote_items_updated
BEFORE UPDATE
ON quote_items
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();