-- Migration 067: Align staff_users uniqueness with how the values are used
--
-- EMAIL  : Must remain unique across ALL tenants. auth.service.login() resolves
--          the account with `WHERE LOWER(email::text) = $1` and no business_id
--          predicate, then takes rows[0] -- a per-tenant email would let one
--          address collide with another tenant and sign into the wrong account.
--          Scope is narrowed to non-deleted rows only, so an address freed by a
--          soft-delete can be re-registered (safe once login also filters
--          deleted_at; see the matching auth.service/middleware changes).
--
-- EMPLOYEE_NUMBER : Generated as EMP001/EMP002 *per business* by
--          staff.service, admin.routes and the public signup flow, so a global
--          UNIQUE made the second tenant collide on INSERT. Re-scoped to
--          (business_id, employee_number). business_id IS NULL (platform owner
--          accounts) is not covered by a composite unique because Postgres
--          treats NULLs as distinct, so a partial index preserves global
--          uniqueness for those rows.

SET search_path TO public;

-- ---------------------------------------------------------------------
-- email: swap the blanket global unique for a non-deleted-only unique
-- ---------------------------------------------------------------------
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_users_email_active
    ON staff_users (email)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- employee_number: global unique -> unique per business
-- ---------------------------------------------------------------------
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_employee_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_users_business_employee_number
    ON staff_users (business_id, employee_number);

-- Covers platform-owner rows (business_id IS NULL), which the composite
-- index above cannot police because NULLs never compare equal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_users_global_employee_number
    ON staff_users (employee_number)
    WHERE business_id IS NULL;

COMMENT ON COLUMN staff_users.employee_number IS
'Per-business staff identifier (EMP001, EMP002, ...). Unique within a business; globally unique only for platform accounts with business_id IS NULL.';

INSERT INTO schema_migrations (migration_name)
VALUES ('067_staff_email_employee_uniqueness.sql')
ON CONFLICT (migration_name) DO NOTHING;
