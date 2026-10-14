-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : CRM Integration
-- File    : 070_crm_integration.sql
-- Purpose : CRM sync idempotency map (external record mapping)
-- ==========================================================
-- Stores the mapping between a local entity (contact / lead / quote) and
-- the corresponding record in an external CRM (Odoo, ...). The unique
-- constraint (business_id, entity_type, entity_id, provider) guarantees
-- idempotency: re-syncing the same entity updates the existing external
-- record instead of creating a duplicate.
--
-- Per-tenant CRM credentials (odoo_url, odoo_db, odoo_api_key, crm_provider,
-- crm_sync_enabled) live in the `settings` table and are created lazily via
-- SettingsService.upsertSetting from the dashboard's Integrations settings.
-- ==========================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS crm_record_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL
        REFERENCES businesses(id) ON DELETE CASCADE,

    -- 'contact' | 'lead' | 'quote'
    entity_type VARCHAR(50) NOT NULL,

    -- Local record id (contacts.id / contacts.id for lead / quotes.id)
    entity_id UUID NOT NULL,

    -- 'odoo' | 'hubspot' | ...
    provider VARCHAR(50) NOT NULL,

    -- External CRM record id (stored as text; Odoo ids are integers)
    external_id VARCHAR(100) NOT NULL,

    -- External model the id refers to (res.partner | crm.lead | sale.order)
    external_model VARCHAR(100),

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_crm_record_map UNIQUE (business_id, entity_type, entity_id, provider)
);

COMMENT ON TABLE crm_record_map IS
'Maps local entities (contact/lead/quote) to their external CRM records for idempotent sync.';

COMMENT ON COLUMN crm_record_map.entity_type IS
'Local entity kind: contact | lead | quote.';

COMMENT ON COLUMN crm_record_map.external_id IS
'The id of the record in the external CRM (e.g. the Odoo res.partner id).';

CREATE INDEX IF NOT EXISTS idx_crm_record_map_lookup
ON crm_record_map(business_id, entity_type, provider);

CREATE INDEX IF NOT EXISTS idx_crm_record_map_external
ON crm_record_map(provider, external_model, external_id);

-- Keep updated_at fresh on updates (reuses the shared update_timestamp()
-- trigger function created in the base schema).
DROP TRIGGER IF EXISTS trg_crm_record_map_updated ON crm_record_map;
CREATE TRIGGER trg_crm_record_map_updated
BEFORE UPDATE ON crm_record_map
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
