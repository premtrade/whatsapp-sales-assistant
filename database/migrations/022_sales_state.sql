BEGIN;

-- ============================================================
-- 022_sales_state.sql
-- Conversation State + Lead State
-- ============================================================

-- ============================================================
-- CONVERSATION STATE
-- Operational state of the current conversation
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS conversation_state VARCHAR(30)
NOT NULL DEFAULT 'open';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_conversation_state_check'
    ) THEN
        ALTER TABLE conversations
        ADD CONSTRAINT conversations_conversation_state_check
        CHECK (
            conversation_state IN (
                'open',
                'waiting_customer',
                'waiting_staff',
                'human_active',
                'closed'
            )
        );
    END IF;
END $$;

-- ============================================================
-- LEAD STATE
-- Sales lifecycle of the customer/opportunity
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS lead_stage VARCHAR(30)
NOT NULL DEFAULT 'new';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_lead_stage_check'
    ) THEN
        ALTER TABLE conversations
        ADD CONSTRAINT conversations_lead_stage_check
        CHECK (
            lead_stage IN (
                'new',
                'qualifying',
                'qualified',
                'product_interest',
                'quote_requested',
                'quote_sent',
                'negotiating',
                'appointment_requested',
                'won',
                'lost'
            )
        );
    END IF;
END $$;

-- ============================================================
-- LEAD STATUS
-- Overall opportunity status
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS lead_status VARCHAR(20)
NOT NULL DEFAULT 'open';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_lead_status_check'
    ) THEN
        ALTER TABLE conversations
        ADD CONSTRAINT conversations_lead_status_check
        CHECK (
            lead_status IN (
                'open',
                'won',
                'lost',
                'disqualified'
            )
        );
    END IF;
END $$;

-- ============================================================
-- SALES PRIORITY
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS priority VARCHAR(20)
NOT NULL DEFAULT 'normal';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_priority_check'
    ) THEN
        ALTER TABLE conversations
        ADD CONSTRAINT conversations_priority_check
        CHECK (
            priority IN (
                'low',
                'normal',
                'high',
                'urgent'
            )
        );
    END IF;
END $$;

-- ============================================================
-- QUALIFICATION
-- Structured sales qualification score
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS qualification_score INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_qualification_score_check'
    ) THEN
        ALTER TABLE conversations
        ADD CONSTRAINT conversations_qualification_score_check
        CHECK (
            qualification_score IS NULL
            OR qualification_score BETWEEN 0 AND 100
        );
    END IF;
END $$;

-- ============================================================
-- SALES METADATA
-- Flexible structured data for qualification details,
-- buying signals, objections, etc.
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS sales_metadata JSONB
NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_conversations_state
ON conversations (conversation_state);

CREATE INDEX IF NOT EXISTS idx_conversations_lead_stage
ON conversations (lead_stage);

CREATE INDEX IF NOT EXISTS idx_conversations_lead_status
ON conversations (lead_status);

CREATE INDEX IF NOT EXISTS idx_conversations_priority
ON conversations (priority);

CREATE INDEX IF NOT EXISTS idx_conversations_sales_pipeline
ON conversations (
    lead_status,
    lead_stage
);

COMMIT;