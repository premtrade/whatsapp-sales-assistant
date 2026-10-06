-- Migration 066: Add soft-delete column to staff_users
-- Purpose : admin.routes.ts filters and soft-deletes staff_users with
--           `deleted_at IS NULL` / `SET deleted_at = NOW()`, but the column
--           was never created (011_staff_users.sql has no deleted_at, and no
--           migration adds one). Every /admin/users query therefore failed
--           with `column "deleted_at" does not exist`, surfacing as a flat
--           500 "Failed to create tenant admin" and an empty user list.

SET search_path TO public;

ALTER TABLE staff_users
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_staff_deleted_at
    ON staff_users(deleted_at)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN staff_users.deleted_at IS
'Soft-delete marker. NULL means the staff user is active/visible.';

INSERT INTO schema_migrations (migration_name)
VALUES ('066_staff_users_deleted_at.sql')
ON CONFLICT (migration_name) DO NOTHING;

