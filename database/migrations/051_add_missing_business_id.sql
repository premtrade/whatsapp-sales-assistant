-- ==========================================================
-- Migration 051: Add Missing business_id Columns for Full Tenant Isolation
-- File    : 051_add_missing_business_id.sql
-- Purpose : Add business_id to tables missing from 045/046/050
-- ==========================================================

SET search_path TO public;

DO $$
DECLARE
    default_business_id UUID;
BEGIN
    SELECT id INTO default_business_id FROM businesses WHERE slug = 'garco' LIMIT 1;
    IF default_business_id IS NULL THEN
        SELECT id INTO default_business_id FROM businesses ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- 1. MESSAGES - Add business_id (derived from conversation)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE messages ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        
        -- Populate from conversation
        UPDATE messages m
        SET business_id = c.business_id
        FROM conversations c
        WHERE m.conversation_id = c.id
        AND m.business_id IS NULL;
        
        IF default_business_id IS NOT NULL THEN
            UPDATE messages SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 2. QUOTE_ITEMS - Add business_id (derived from quote)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quote_items' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE quote_items ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        
        -- Populate from quote
        UPDATE quote_items qi
        SET business_id = q.business_id
        FROM quotes q
        WHERE qi.quote_id = q.id
        AND qi.business_id IS NULL;
        
        IF default_business_id IS NOT NULL THEN
            UPDATE quote_items SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 3. KNOWLEDGE_CHUNKS - Add business_id (derived from knowledge_documents)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'knowledge_chunks' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE knowledge_chunks ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        
        -- Populate from knowledge_documents
        UPDATE knowledge_chunks kc
        SET business_id = kd.business_id
        FROM knowledge_documents kd
        WHERE kc.document_id = kd.id
        AND kc.business_id IS NULL;
        
        IF default_business_id IS NOT NULL THEN
            UPDATE knowledge_chunks SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 4. CUSTOMER_FACTS - Add business_id (derived from contacts)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_facts' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE customer_facts ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        
        -- Populate from contacts
        UPDATE customer_facts cf
        SET business_id = c.business_id
        FROM contacts c
        WHERE cf.contact_id = c.id
        AND cf.business_id IS NULL;
        
        IF default_business_id IS NOT NULL THEN
            UPDATE customer_facts SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 5. CONVERSATION_SUMMARIES - Add business_id (derived from conversation)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_summaries' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE conversation_summaries ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        
        -- Populate from conversation
        UPDATE conversation_summaries cs
        SET business_id = c.business_id
        FROM conversations c
        WHERE cs.conversation_id = c.id
        AND cs.business_id IS NULL;
        
        IF default_business_id IS NOT NULL THEN
            UPDATE conversation_summaries SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 6. MEMORY_EMBEDDINGS - Add business_id (derived from contact or conversation)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'memory_embeddings' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE memory_embeddings ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        
        -- Populate from contact
        UPDATE memory_embeddings me
        SET business_id = c.business_id
        FROM contacts c
        WHERE me.contact_id = c.id
        AND me.business_id IS NULL;
        
        -- Populate from conversation where contact_id is null
        UPDATE memory_embeddings me
        SET business_id = c.business_id
        FROM conversations c
        WHERE me.conversation_id = c.id
        AND me.business_id IS NULL;
        
        IF default_business_id IS NOT NULL THEN
            UPDATE memory_embeddings SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 7. LEAD_SCORES - Add business_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'lead_scores' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE lead_scores ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        
        -- Populate from contact
        UPDATE lead_scores ls
        SET business_id = c.business_id
        FROM contacts c
        WHERE ls.contact_id = c.id
        AND ls.business_id IS NULL;
        
        IF default_business_id IS NOT NULL THEN
            UPDATE lead_scores SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 8. CONVERSATION_NOTES - Add business_id (derived from conversation)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_notes' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE conversation_notes ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        
        -- Populate from conversation
        UPDATE conversation_notes cn
        SET business_id = c.business_id
        FROM conversations c
        WHERE cn.conversation_id = c.id
        AND cn.business_id IS NULL;
        
        IF default_business_id IS NOT NULL THEN
            UPDATE conversation_notes SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

END $$;

-- ==========================================================
-- NOT NULL Constraints & Indexes
-- ==========================================================

-- Messages
ALTER TABLE messages ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_business ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_business_conversation ON messages(business_id, conversation_id);

-- Quote Items
ALTER TABLE quote_items ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_items_business ON quote_items(business_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_business_quote ON quote_items(business_id, quote_id);

-- Knowledge Chunks
ALTER TABLE knowledge_chunks ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_business ON knowledge_chunks(business_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_business_document ON knowledge_chunks(business_id, document_id);

-- Customer Facts
ALTER TABLE customer_facts ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_facts_business ON customer_facts(business_id);
CREATE INDEX IF NOT EXISTS idx_customer_facts_business_contact ON customer_facts(business_id, contact_id);
-- Update unique constraint to be tenant-aware
DROP INDEX IF EXISTS uq_customer_fact;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_facts_business_key ON customer_facts(business_id, contact_id, fact_key);

-- Conversation Summaries
ALTER TABLE conversation_summaries ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_business ON conversation_summaries(business_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_business_conversation ON conversation_summaries(business_id, conversation_id);

-- Memory Embeddings
ALTER TABLE memory_embeddings ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_business ON memory_embeddings(business_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_business_contact ON memory_embeddings(business_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_business_conversation ON memory_embeddings(business_id, conversation_id);

-- Lead Scores
ALTER TABLE lead_scores ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_scores_business ON lead_scores(business_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_business_contact ON lead_scores(business_id, contact_id);

-- Conversation Notes
ALTER TABLE conversation_notes ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_notes_business ON conversation_notes(business_id);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_business_conversation ON conversation_notes(business_id, conversation_id);