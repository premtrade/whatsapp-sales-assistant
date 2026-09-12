-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2
-- File    : 028_audit_logs_immutable.sql
-- Purpose : Prevent UPDATE/DELETE on audit_logs
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- FUNCTION
-- ==========================================================

CREATE OR REPLACE FUNCTION prevent_audit_logs_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is immutable. UPDATE and DELETE operations are not allowed.';
END;
$$ LANGUAGE plpgsql;

-- ==========================================================
-- TRIGGERS
-- ==========================================================

DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_modification();

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_modification();
