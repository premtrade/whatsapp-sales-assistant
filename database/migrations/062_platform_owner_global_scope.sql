-- Platform-owner accounts are global operators, not members of the legacy
-- Garco tenant. Keep tenant administration available through X-Tenant-ID.
SET search_path TO public;

UPDATE staff_users
SET business_id = NULL,
    updated_at = NOW()
WHERE role = 'super_admin'
  AND business_id IS NOT NULL;
