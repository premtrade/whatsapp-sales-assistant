-- Configure the existing single-tenant deployment for the active WAHA session.
-- Additional tenants must use their own unique waha_session_name.
SET search_path TO public;

UPDATE businesses
SET waha_session_name = 'default',
    updated_at = NOW()
WHERE slug = 'garco'
  AND waha_session_name IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_businesses_waha_session
    ON businesses (waha_session_name)
    WHERE waha_session_name IS NOT NULL;
