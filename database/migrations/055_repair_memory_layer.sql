-- ============================================================
-- Migration 055: Repair missing memory-layer tables/columns
-- Idempotent: safe to run multiple times, preserves data.
-- Fixes: relation "customer_facts" does not exist (WF 03/04/08),
--   relation "lead_scores" does not exist (WF 08),
--   missing quotes.sent_at/pdf_url (033 follow-up).
-- Root cause: postgres_data volume was initialised before 019
--   and 033/035/040 were added; initdb scripts only run on
--   FIRST volume creation, so the live DB never got them.
-- ============================================================
SET search_path TO public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. customer_facts (019 shape + 051 tenant column) ----------
CREATE TABLE IF NOT EXISTS customer_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    fact_key TEXT NOT NULL,
    fact_value TEXT NOT NULL,
    confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000
        CHECK (confidence >= 0 AND confidence <= 1),
    source TEXT NOT NULL DEFAULT 'ai'
        CHECK (source IN ('ai', 'manual', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='customer_facts')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='customer_facts'
          AND column_name='business_id')
    AND EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='businesses') THEN
        ALTER TABLE customer_facts ADD COLUMN business_id UUID
            REFERENCES businesses(id) ON DELETE CASCADE;
        UPDATE customer_facts cf SET business_id = c.business_id
          FROM contacts c WHERE cf.contact_id = c.id AND cf.business_id IS NULL;
    END IF;
END $$;
DO $$
DECLARE has_b BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='customer_facts'
          AND column_name='business_id') INTO has_b;
    IF NOT has_b THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_customer_fact') THEN
            ALTER TABLE customer_facts
                ADD CONSTRAINT uq_customer_fact UNIQUE (contact_id, fact_key);
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
            WHERE c.conname='uq_customer_fact' AND t.relname='customer_facts') THEN
            ALTER TABLE customer_facts DROP CONSTRAINT uq_customer_fact;
        END IF;
        DROP INDEX IF EXISTS uq_customer_fact;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_facts_business_key
            ON customer_facts(business_id, contact_id, fact_key);
        CREATE INDEX IF NOT EXISTS idx_customer_facts_business ON customer_facts(business_id);
        CREATE INDEX IF NOT EXISTS idx_customer_facts_business_contact
            ON customer_facts(business_id, contact_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_customer_facts_contact ON customer_facts(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_facts_key ON customer_facts(fact_key);
CREATE INDEX IF NOT EXISTS idx_customer_facts_updated ON customer_facts(updated_at DESC);
DROP TRIGGER IF EXISTS trg_customer_facts_updated ON customer_facts;
CREATE TRIGGER trg_customer_facts_updated BEFORE UPDATE ON customer_facts
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
-- 2. conversation_summaries (020 shape, idempotent) -----------
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    start_message_at TIMESTAMPTZ,
    end_message_at TIMESTAMPTZ,
    created_by TEXT NOT NULL DEFAULT 'ai'
        CHECK (created_by IN ('ai', 'manual', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='conversation_summaries')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='conversation_summaries'
          AND column_name='business_id')
    AND EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='businesses') THEN
        ALTER TABLE conversation_summaries ADD COLUMN business_id UUID
            REFERENCES businesses(id) ON DELETE CASCADE;
        UPDATE conversation_summaries cs SET business_id = c.business_id
          FROM conversations c WHERE cs.conversation_id = c.id AND cs.business_id IS NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation
    ON conversation_summaries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_created
    ON conversation_summaries(created_at DESC);
DROP TRIGGER IF EXISTS trg_conversation_summaries_updated ON conversation_summaries;
CREATE TRIGGER trg_conversation_summaries_updated BEFORE UPDATE ON conversation_summaries
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- 3. memory_embeddings (021 shape, idempotent) ----------------
CREATE TABLE IF NOT EXISTS memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('message', 'summary', 'fact', 'knowledge')),
    source_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding_model TEXT,
    embedding_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
    embedded_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='memory_embeddings')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='memory_embeddings'
          AND column_name='business_id')
    AND EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='businesses') THEN
        ALTER TABLE memory_embeddings ADD COLUMN business_id UUID
            REFERENCES businesses(id) ON DELETE CASCADE;
        UPDATE memory_embeddings me SET business_id = c.business_id
          FROM contacts c WHERE me.contact_id = c.id AND me.business_id IS NULL;
        UPDATE memory_embeddings me SET business_id = c.business_id
          FROM conversations c WHERE me.conversation_id = c.id AND me.business_id IS NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_contact ON memory_embeddings(contact_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_conversation ON memory_embeddings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_source ON memory_embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_status ON memory_embeddings(embedding_status);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_created ON memory_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_metadata ON memory_embeddings USING GIN(metadata);
DROP TRIGGER IF EXISTS trg_memory_embeddings_updated ON memory_embeddings;
CREATE TRIGGER trg_memory_embeddings_updated BEFORE UPDATE ON memory_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- 4. lead_scores (035 shape, WF 08 Upsert Lead Score target) -
CREATE TABLE IF NOT EXISTS lead_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    budget_score INTEGER NOT NULL DEFAULT 0 CHECK (budget_score BETWEEN 0 AND 100),
    urgency_score INTEGER NOT NULL DEFAULT 0 CHECK (urgency_score BETWEEN 0 AND 100),
    project_type_score INTEGER NOT NULL DEFAULT 0 CHECK (project_type_score BETWEEN 0 AND 100),
    location_score INTEGER NOT NULL DEFAULT 0 CHECK (location_score BETWEEN 0 AND 100),
    engagement_score INTEGER NOT NULL DEFAULT 0 CHECK (engagement_score BETWEEN 0 AND 100),
    total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 100),
    status VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'qualified', 'unqualified', 'converted', 'lost')),
    project_type VARCHAR(100),
    estimated_budget VARCHAR(50),
    preferred_timeline VARCHAR(50),
    project_location VARCHAR(255),
    score_reasoning JSONB DEFAULT '{}'::jsonb,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(contact_id, conversation_id)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='lead_scores')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='lead_scores'
          AND column_name='business_id')
    AND EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='businesses') THEN
        ALTER TABLE lead_scores ADD COLUMN business_id UUID
            REFERENCES businesses(id) ON DELETE CASCADE;
        UPDATE lead_scores ls SET business_id = c.business_id
          FROM contacts c WHERE ls.contact_id = c.id AND ls.business_id IS NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_lead_scores_contact_id ON lead_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_conversation_id ON lead_scores(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_total_score ON lead_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_scores_status ON lead_scores(status);
DROP TRIGGER IF EXISTS trg_lead_scores_updated ON lead_scores;
CREATE TRIGGER trg_lead_scores_updated BEFORE UPDATE ON lead_scores
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TABLE IF NOT EXISTS lead_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_score_id UUID NOT NULL REFERENCES lead_scores(id) ON DELETE CASCADE,
    previous_total_score INTEGER,
    new_total_score INTEGER,
    change_reason VARCHAR(255),
    changed_by VARCHAR(50) DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead_id ON lead_score_history(lead_score_id);

-- 5. follow_up_queue (040 shape, WF 08 follow-up target) ------
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
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_conversation ON follow_up_queue(conversation_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_contact ON follow_up_queue(contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_scheduled ON follow_up_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_status ON follow_up_queue(status);
DROP TRIGGER IF EXISTS trg_follow_up_queue_updated ON follow_up_queue;
CREATE TRIGGER trg_follow_up_queue_updated BEFORE UPDATE ON follow_up_queue
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- 6. quotes PDF columns (033 shape, follow-up WF reads sent_at)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_via VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_quotes_pdf_null ON quotes(id)
    WHERE pdf_url IS NULL AND status != 'draft';
DROP TRIGGER IF EXISTS trg_memory_embeddings_updated ON memory_embeddings;
CREATE TRIGGER trg_memory_embeddings_updated BEFORE UPDATE ON memory_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

