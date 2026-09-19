-- ==========================================================
-- Migration 051: Add Missing business_id Columns for Full Tenant Isolation
-- File    : 051_add_missing_business_id.sql
-- Purpose : Add business_id to tables missing from 045/046/050
-- ==========================================================

SET search_path TO public;

DO $$
DECLARE
    default_business_id UUID;
    target_table TEXT;
    col_exists BOOLEAN;
    tbl_exists BOOLEAN;
BEGIN
    SELECT id INTO default_business_id FROM businesses WHERE slug = 'garco' LIMIT 1;
    IF default_business_id IS NULL THEN
        SELECT id INTO default_business_id FROM businesses ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- 1. MESSAGES - Add business_id (derived from conversation)
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') INTO tbl_exists;
    IF tbl_exists THEN
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'business_id') INTO col_exists;
        IF NOT col_exists THEN
            ALTER TABLE messages ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
            UPDATE messages m SET business_id = c.business_id FROM conversations c WHERE m.conversation_id = c.id AND m.business_id IS NULL;
            IF default_business_id IS NOT NULL THEN UPDATE messages SET business_id = default_business_id WHERE business_id IS NULL; END IF;
        END IF;
    END IF;

    -- 2. QUOTE_ITEMS - Add business_id (derived from quote)
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quote_items') INTO tbl_exists;
    IF tbl_exists THEN
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_items' AND column_name = 'business_id') INTO col_exists;
        IF NOT col_exists THEN
            ALTER TABLE quote_items ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
            UPDATE quote_items qi SET business_id = q.business_id FROM quotes q WHERE qi.quote_id = q.id AND qi.business_id IS NULL;
            IF default_business_id IS NOT NULL THEN UPDATE quote_items SET business_id = default_business_id WHERE business_id IS NULL; END IF;
        END IF;
    END IF;

    -- 3. KNOWLEDGE_CHUNKS - Add business_id (derived from knowledge_documents)
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'knowledge_chunks') INTO tbl_exists;
    IF tbl_exists THEN
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_chunks' AND column_name = 'business_id') INTO col_exists;
        IF NOT col_exists THEN
            ALTER TABLE knowledge_chunks ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
            UPDATE knowledge_chunks kc SET business_id = kd.business_id FROM knowledge_documents kd WHERE kc.document_id = kd.id AND kc.business_id IS NULL;
            IF default_business_id IS NOT NULL THEN UPDATE knowledge_chunks SET business_id = default_business_id WHERE business_id IS NULL; END IF;
        END IF;
    END IF;

    -- 4. CUSTOMER_FACTS - Add business_id (derived from contacts)
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_facts') INTO tbl_exists;
    IF tbl_exists THEN
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_facts' AND column_name = 'business_id') INTO col_exists;
        IF NOT col_exists THEN
            ALTER TABLE customer_facts ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
            UPDATE customer_facts cf SET business_id = c.business_id FROM contacts c WHERE cf.contact_id = c.id AND cf.business_id IS NULL;
            IF default_business_id IS NOT NULL THEN UPDATE customer_facts SET business_id = default_business_id WHERE business_id IS NULL; END IF;
        END IF;
    END IF;

    -- 5. CONVERSATION_SUMMARIES - Add business_id (derived from conversation)
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_summaries') INTO tbl_exists;
    IF tbl_exists THEN
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversation_summaries' AND column_name = 'business_id') INTO col_exists;
        IF NOT col_exists THEN
            ALTER TABLE conversation_summaries ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
            UPDATE conversation_summaries cs SET business_id = c.business_id FROM conversations c WHERE cs.conversation_id = c.id AND cs.business_id IS NULL;
            IF default_business_id IS NOT NULL THEN UPDATE conversation_summaries SET business_id = default_business_id WHERE business_id IS NULL; END IF;
        END IF;
    END IF;

    -- 6. MEMORY_EMBEDDINGS - Add business_id (derived from contact or conversation)
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'memory_embeddings') INTO tbl_exists;
    IF tbl_exists THEN
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memory_embeddings' AND column_name = 'business_id') INTO col_exists;
        IF NOT col_exists THEN
            ALTER TABLE memory_embeddings ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
            UPDATE memory_embeddings me SET business_id = c.business_id FROM contacts c WHERE me.contact_id = c.id AND me.business_id IS NULL;
            UPDATE memory_embeddings me SET business_id = c.business_id FROM conversations c WHERE me.conversation_id = c.id AND me.business_id IS NULL;
            IF default_business_id IS NOT NULL THEN UPDATE memory_embeddings SET business_id = default_business_id WHERE business_id IS NULL; END IF;
        END IF;
    END IF;

    -- 7. LEAD_SCORES - Add business_id
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_scores') INTO tbl_exists;
    IF tbl_exists THEN
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lead_scores' AND column_name = 'business_id') INTO col_exists;
        IF NOT col_exists THEN
            ALTER TABLE lead_scores ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
            UPDATE lead_scores ls SET business_id = c.business_id FROM contacts c WHERE ls.contact_id = c.id AND ls.business_id IS NULL;
            IF default_business_id IS NOT NULL THEN UPDATE lead_scores SET business_id = default_business_id WHERE business_id IS NULL; END IF;
        END IF;
    END IF;

    -- 8. CONVERSATION_NOTES - Add business_id (derived from conversation)
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_notes') INTO tbl_exists;
    IF tbl_exists THEN
        SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversation_notes' AND column_name = 'business_id') INTO col_exists;
        IF NOT col_exists THEN
            ALTER TABLE conversation_notes ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
            UPDATE conversation_notes cn SET business_id = c.business_id FROM conversations c WHERE cn.conversation_id = c.id AND cn.business_id IS NULL;
            IF default_business_id IS NOT NULL THEN UPDATE conversation_notes SET business_id = default_business_id WHERE business_id IS NULL; END IF;
        END IF;
    END IF;

END $$;

-- ==========================================================
-- NOT NULL Constraints & Indexes
-- ==========================================================

-- Messages
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'business_id'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM messages WHERE business_id IS NULL) THEN
            ALTER TABLE messages ALTER COLUMN business_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'Skipping SET NOT NULL on messages.business_id: NULL values remain';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_messages_business ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_business_conversation ON messages(business_id, conversation_id);

-- Quote Items
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'quote_items'
          AND column_name = 'business_id'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM quote_items WHERE business_id IS NULL) THEN
            ALTER TABLE quote_items ALTER COLUMN business_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'Skipping SET NOT NULL on quote_items.business_id: NULL values remain';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_quote_items_business ON quote_items(business_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_business_quote ON quote_items(business_id, quote_id);

-- Knowledge Chunks
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_chunks'
          AND column_name = 'business_id'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM knowledge_chunks WHERE business_id IS NULL) THEN
            ALTER TABLE knowledge_chunks ALTER COLUMN business_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'Skipping SET NOT NULL on knowledge_chunks.business_id: NULL values remain';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_business ON knowledge_chunks(business_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_business_document ON knowledge_chunks(business_id, document_id);

-- Customer Facts
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'customer_facts'
          AND column_name = 'business_id'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM customer_facts WHERE business_id IS NULL) THEN
            ALTER TABLE customer_facts ALTER COLUMN business_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'Skipping SET NOT NULL on customer_facts.business_id: NULL values remain';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_customer_facts_business ON customer_facts(business_id);
CREATE INDEX IF NOT EXISTS idx_customer_facts_business_contact ON customer_facts(business_id, contact_id);
-- Update unique constraint to be tenant-aware.
-- uq_customer_fact may exist as a standalone index OR as a UNIQUE CONSTRAINT
-- (backed by an index). DROP INDEX alone fails in the constraint case, so drop
-- the constraint first when present, then drop any leftover index.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'customer_facts'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE c.conname = 'uq_customer_fact'
              AND t.relname = 'customer_facts'
        ) THEN
            ALTER TABLE customer_facts DROP CONSTRAINT uq_customer_fact;
        END IF;
    END IF;
END $$;
DROP INDEX IF EXISTS uq_customer_fact;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_facts_business_key ON customer_facts(business_id, contact_id, fact_key);

-- Conversation Summaries
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_summaries'
          AND column_name = 'business_id'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM conversation_summaries WHERE business_id IS NULL) THEN
            ALTER TABLE conversation_summaries ALTER COLUMN business_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'Skipping SET NOT NULL on conversation_summaries.business_id: NULL values remain';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_business ON conversation_summaries(business_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_business_conversation ON conversation_summaries(business_id, conversation_id);

-- Memory Embeddings
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'memory_embeddings'
          AND column_name = 'business_id'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM memory_embeddings WHERE business_id IS NULL) THEN
            ALTER TABLE memory_embeddings ALTER COLUMN business_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'Skipping SET NOT NULL on memory_embeddings.business_id: NULL values remain';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_business ON memory_embeddings(business_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_business_contact ON memory_embeddings(business_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_business_conversation ON memory_embeddings(business_id, conversation_id);

-- Lead Scores
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'lead_scores'
          AND column_name = 'business_id'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM lead_scores WHERE business_id IS NULL) THEN
            ALTER TABLE lead_scores ALTER COLUMN business_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'Skipping SET NOT NULL on lead_scores.business_id: NULL values remain';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_lead_scores_business ON lead_scores(business_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_business_contact ON lead_scores(business_id, contact_id);

-- Conversation Notes
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_notes'
          AND column_name = 'business_id'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM conversation_notes WHERE business_id IS NULL) THEN
            ALTER TABLE conversation_notes ALTER COLUMN business_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'Skipping SET NOT NULL on conversation_notes.business_id: NULL values remain';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_conversation_notes_business ON conversation_notes(business_id);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_business_conversation ON conversation_notes(business_id, conversation_id);