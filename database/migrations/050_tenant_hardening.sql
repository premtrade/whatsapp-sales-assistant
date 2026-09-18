-- ==========================================================
-- Migration 050: Tenant Isolation Hardening
-- File    : 050_tenant_hardening.sql
-- Purpose : Scope audit_logs, quick_replies, and queues by tenant
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

    -- 1. AUDIT LOGS
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE audit_logs ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        IF default_business_id IS NOT NULL THEN
            UPDATE audit_logs SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 2. QUICK REPLIES
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_replies' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE quick_replies ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        IF default_business_id IS NOT NULL THEN
            UPDATE quick_replies SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
        -- Update unique index to be tenant-aware
        DROP INDEX IF EXISTS uq_quick_replies_title;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_quick_replies_business_title ON quick_replies(business_id, title);
    END IF;

    -- 3. FOLLOW UP QUEUE
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'follow_up_queue' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE follow_up_queue ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        IF default_business_id IS NOT NULL THEN
            UPDATE follow_up_queue SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;

    -- 4. WAHA RETRY QUEUE
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'waha_retry_queue' AND column_name = 'business_id'
    ) THEN
        ALTER TABLE waha_retry_queue ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
        IF default_business_id IS NOT NULL THEN
            UPDATE waha_retry_queue SET business_id = default_business_id WHERE business_id IS NULL;
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created ON audit_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quick_replies_business ON quick_replies(business_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_business ON follow_up_queue(business_id);
CREATE INDEX IF NOT EXISTS idx_waha_retry_queue_business ON waha_retry_queue(business_id);

