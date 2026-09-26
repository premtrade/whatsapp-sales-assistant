-- Migration 054: Expand staff_users role and status constraints
-- Purpose : Allow super_admin role and invited status introduced by onboarding/monetization work

SET search_path TO public;

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE staff_users ADD CONSTRAINT staff_users_role_check
  CHECK (role = ANY (ARRAY['super_admin'::varchar, 'admin'::varchar, 'manager'::varchar, 'sales'::varchar, 'support'::varchar, 'technician'::varchar]));

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_status_check;
ALTER TABLE staff_users ADD CONSTRAINT staff_users_status_check
  CHECK (status = ANY (ARRAY['active'::varchar, 'inactive'::varchar, 'suspended'::varchar, 'invited'::varchar]));
