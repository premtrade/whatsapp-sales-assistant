-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : Tenant collision cleanup
-- File    : 071_remove_demo_garco_business.sql
-- Purpose : Retire the legacy demo "Garco" business so the shared
--           WhatsApp number resolves unambiguously to the real
--           tenant (Rolinj.io).
-- ==========================================================
-- ROOT CAUSE
--   Garco (demo) and Rolinj.io (real) both match the same incoming
--   WhatsApp number. Workflow 01 "Upsert Contact" resolves the tenant
--   with `... ORDER BY <preference> LIMIT 1`; when neither business
--   matches on waha_session_name, the tiebreak is ambiguous and an
--   arbitrary business (Garco) is picked. Garco has no knowledge docs,
--   so the AI Brain falls back to the canned "our company" greeting.
--
-- WHY SOFT-DELETE (not a hard DELETE)
--   - Reversible: set deleted_at back to NULL to restore.
--   - FK-safe: businesses children are ON DELETE CASCADE, so a hard
--     delete would destroy Garco's contacts/conversations/messages.
--     A soft delete (deleted_at) triggers no cascade.
--   - Every tenant resolver in the app filters `deleted_at IS NULL`,
--     so Garco stops matching immediately once deleted_at is set.
--
-- WHY contacts are safe
--   Migration 046 dropped the global contacts_phone_key and made phone
--   unique per (business_id, phone). Returning customers therefore get a
--   fresh contact under Rolinj.io with no collision against old Garco rows.
--
-- This block is idempotent: it is a no-op (with a NOTICE) if there is no
-- active business with slug 'garco'.
-- ==========================================================

SET search_path TO public;

DO $$
DECLARE
    gid UUID;
    gname TEXT;
BEGIN
    SELECT id, name INTO gid, gname
    FROM businesses
    WHERE slug = 'garco' AND deleted_at IS NULL
    LIMIT 1;

    IF gid IS NULL THEN
        RAISE NOTICE 'No active business with slug ''garco'' found; nothing to do.';
        RETURN;
    END IF;

    UPDATE businesses
    SET deleted_at = NOW(),
        status = 'inactive',
        -- Release the shared number/session so Garco can never re-collide,
        -- even if the row is later restored.
        whatsapp_phone = NULL,
        waha_session_name = NULL,
        updated_at = NOW()
    WHERE id = gid;

    RAISE NOTICE 'Soft-deleted demo business % (id %)', gname, gid;
END $$;
