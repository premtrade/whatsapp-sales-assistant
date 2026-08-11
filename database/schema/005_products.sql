-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 005_products.sql
-- Purpose : Products & Services Catalog
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS products
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sku VARCHAR(100) UNIQUE,

    name VARCHAR(255) NOT NULL,

    description TEXT,

    category VARCHAR(100),

    product_type VARCHAR(20)
        NOT NULL DEFAULT 'service'
        CHECK (
            product_type IN (
                'product',
                'service'
            )
        ),

    unit VARCHAR(50)
        NOT NULL DEFAULT 'each',

    price NUMERIC(12,2)
        NOT NULL DEFAULT 0.00,

    currency VARCHAR(3)
        NOT NULL DEFAULT 'JMD',

    taxable BOOLEAN
        NOT NULL DEFAULT TRUE,

    tax_rate NUMERIC(5,2)
        NOT NULL DEFAULT 0.00,

    active BOOLEAN
        NOT NULL DEFAULT TRUE,

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE products IS
'Products and services available for quotations.';

COMMENT ON COLUMN products.product_type IS
'Indicates whether this record is a product or a service.';

COMMENT ON COLUMN products.metadata IS
'Future-proof JSON field for custom attributes.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_products_name
ON products(name);

CREATE INDEX IF NOT EXISTS idx_products_category
ON products(category);

CREATE INDEX IF NOT EXISTS idx_products_type
ON products(product_type);

CREATE INDEX IF NOT EXISTS idx_products_active
ON products(active);

CREATE INDEX IF NOT EXISTS idx_products_metadata
ON products
USING GIN(metadata);

-- ==========================================================
-- TRIGGER
-- ==========================================================

DROP TRIGGER IF EXISTS trg_products_updated
ON products;

CREATE TRIGGER trg_products_updated
BEFORE UPDATE
ON products
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();