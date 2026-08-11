-- ============================================================
-- 019_customer_facts.sql
-- WhatsApp Sales Assistant
-- AI Memory Layer
-- ============================================================

CREATE TABLE customer_facts (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contact_id UUID NOT NULL
        REFERENCES contacts(id)
        ON DELETE CASCADE,

    fact_key TEXT NOT NULL,

    fact_value TEXT NOT NULL,

    confidence NUMERIC(4,3)
        NOT NULL
        DEFAULT 1.000
        CHECK (
            confidence >= 0
            AND confidence <= 1
        ),

    source TEXT NOT NULL
        DEFAULT 'ai'
        CHECK (
            source IN (
                'ai',
                'manual',
                'system'
            )
        ),

    created_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW(),

    CONSTRAINT uq_customer_fact
        UNIQUE (
            contact_id,
            fact_key
        )

);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_customer_facts_contact
ON customer_facts(contact_id);

CREATE INDEX idx_customer_facts_key
ON customer_facts(fact_key);

CREATE INDEX idx_customer_facts_updated
ON customer_facts(updated_at DESC);

-- ============================================================
-- Trigger
-- ============================================================

CREATE TRIGGER trg_customer_facts_updated
BEFORE UPDATE
ON customer_facts
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();