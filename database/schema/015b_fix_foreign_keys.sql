-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2.5
-- File    : 015b_fix_foreign_keys.sql
-- Purpose : Add Missing Staff Foreign Keys
-- ==========================================================

SET search_path TO public;

-- ----------------------------------------------------------
-- appointments.assigned_to -> staff_users.id
-- ----------------------------------------------------------

ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS fk_appointments_staff;

ALTER TABLE appointments
ADD CONSTRAINT fk_appointments_staff
FOREIGN KEY (assigned_to)
REFERENCES staff_users(id)
ON DELETE SET NULL;

-- ----------------------------------------------------------
-- quotes.created_by -> staff_users.id
-- ----------------------------------------------------------

ALTER TABLE quotes
DROP CONSTRAINT IF EXISTS fk_quotes_created_by;

ALTER TABLE quotes
ADD CONSTRAINT fk_quotes_created_by
FOREIGN KEY (created_by)
REFERENCES staff_users(id)
ON DELETE SET NULL;

-- ----------------------------------------------------------
-- handoffs.assigned_to -> staff_users.id
-- ----------------------------------------------------------

ALTER TABLE handoffs
DROP CONSTRAINT IF EXISTS fk_handoffs_staff;

ALTER TABLE handoffs
ADD CONSTRAINT fk_handoffs_staff
FOREIGN KEY (assigned_to)
REFERENCES staff_users(id)
ON DELETE SET NULL;

-- ----------------------------------------------------------
-- conversations.assigned_to -> staff_users.id
-- (originally deferred because staff_users is created after conversations)
-- ----------------------------------------------------------

ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS fk_conversations_staff;

ALTER TABLE conversations
ADD CONSTRAINT fk_conversations_staff
FOREIGN KEY (assigned_to)
REFERENCES staff_users(id)
ON DELETE SET NULL;

-- ----------------------------------------------------------
-- audit_logs.performed_by -> staff_users.id
-- ----------------------------------------------------------

ALTER TABLE audit_logs
DROP CONSTRAINT IF EXISTS fk_audit_staff;

ALTER TABLE audit_logs
ADD CONSTRAINT fk_audit_staff
FOREIGN KEY (performed_by)
REFERENCES staff_users(id)
ON DELETE SET NULL;
