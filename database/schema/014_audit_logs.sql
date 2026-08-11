-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 014_audit_logs.sql
-- Purpose : Audit Logging
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- TABLE
-- ==========================================================

CREATE TABLE IF NOT EXISTS audit_logs
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    entity_type VARCHAR(50) NOT NULL,

    entity_id UUID,

    action VARCHAR(50) NOT NULL,

    performed_by UUID,

    performed_by_type VARCHAR(20)
        NOT NULL DEFAULT 'system'
        CHECK (
            performed_by_type IN
            (
                'system',
                'ai',
                'staff',
                'customer'
            )
        ),

    description TEXT,

    old_values JSONB,

    new_values JSONB,

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    ip_address INET,

    user_agent TEXT,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- COMMENTS
-- ==========================================================

COMMENT ON TABLE audit_logs IS
'Immutable audit trail for all important system events.';

COMMENT ON COLUMN audit_logs.entity_type IS
'The table or entity affected (quotes, products, contacts, etc.).';

COMMENT ON COLUMN audit_logs.action IS
'Action performed (create, update, delete, send, receive, etc.).';

COMMENT ON COLUMN audit_logs.old_values IS
'JSON snapshot before the change.';

COMMENT ON COLUMN audit_logs.new_values IS
'JSON snapshot after the change.';

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_audit_entity
ON audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_action
ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_audit_performed_by
ON audit_logs(performed_by);

CREATE INDEX IF NOT EXISTS idx_audit_created
ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_metadata
ON audit_logs
USING GIN(metadata);
