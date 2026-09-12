-- =============================================================================
-- Migration: Add password_hash to staff_users
-- =============================================================================
-- This migration adds password hashing support for staff authentication

SET search_path TO public;

-- ==========================================================
-- ALTER TABLE
-- ==========================================================

ALTER TABLE staff_users
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- ==========================================================
-- INDEX
-- ==========================================================

CREATE INDEX IF NOT EXISTS idx_staff_password_hash
    ON staff_users(password_hash);

-- ==========================================================
-- COMMENT
-- ==========================================================

COMMENT ON COLUMN staff_users.password_hash IS
    'Bcrypt-hashed password for staff authentication.';
