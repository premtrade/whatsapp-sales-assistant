-- ==========================================================
-- WhatsApp Sales Assistant
-- Sprint 2
-- File: 001_functions.sql
-- ==========================================================

SET search_path TO public;

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS
$$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
