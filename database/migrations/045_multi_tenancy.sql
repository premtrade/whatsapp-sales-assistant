-- ==========================================================
-- Multi-Tenancy Migration (Part 1: Businesses Table)
-- File    : 045_multi_tenancy.sql
-- ==========================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    email VARCHAR(255),
    phone VARCHAR(25),
    website VARCHAR(255),
    address TEXT,
    currency VARCHAR(3) NOT NULL DEFAULT 'JMD',
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/Jamaica',
    logo_url VARCHAR(500),
    whatsapp_phone VARCHAR(25) UNIQUE,
    waha_session_name VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'suspended')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);
CREATE INDEX IF NOT EXISTS idx_businesses_whatsapp ON businesses(whatsapp_phone);

DROP TRIGGER IF EXISTS trg_businesses_updated ON businesses;
CREATE TRIGGER trg_businesses_updated
    BEFORE UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- ==========================================================
-- ADD business_id TO EXISTING TABLES
-- ==========================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS key VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_settings_business ON settings(business_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);

ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_knowledge_business ON knowledge_documents(business_id);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_contacts_business ON contacts(business_id);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_conversations_business ON conversations(business_id);

ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_staff_business ON staff_users(business_id);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_quotes_business ON quotes(business_id);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_appointments_business ON appointments(business_id);

ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_handoffs_business ON handoffs(business_id);

-- ==========================================================
-- SEED DEFAULT BUSINESS (GARCO) & ASSIGN EXISTING DATA
-- ==========================================================

INSERT INTO businesses (name, slug, description, currency, timezone, status)
VALUES (
    'Garco Construction Services Limited',
    'garco',
    'General contractor and construction management company',
    'JMD',
    'America/Jamaica',
    'active'
)
ON CONFLICT (slug) DO NOTHING;

-- Assign all existing data to Garco
DO $$
DECLARE
    garco_id UUID;
BEGIN
    SELECT id INTO garco_id FROM businesses WHERE slug = 'garco';
    
    UPDATE settings SET business_id = garco_id WHERE business_id IS NULL;
    UPDATE products SET business_id = garco_id WHERE business_id IS NULL;
    UPDATE knowledge_documents SET business_id = garco_id WHERE business_id IS NULL;
    UPDATE contacts SET business_id = garco_id WHERE business_id IS NULL;
    UPDATE conversations SET business_id = garco_id WHERE business_id IS NULL;
    UPDATE staff_users SET business_id = garco_id WHERE business_id IS NULL;
    UPDATE quotes SET business_id = garco_id WHERE business_id IS NULL;
    UPDATE appointments SET business_id = garco_id WHERE business_id IS NULL;
    UPDATE handoffs SET business_id = garco_id WHERE business_id IS NULL;
    
    UPDATE settings SET key = setting_key WHERE key IS NULL;
END $$;

-- ==========================================================
-- FOREIGN KEY CONSTRAINTS
-- ==========================================================

ALTER TABLE settings ADD CONSTRAINT fk_settings_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    
ALTER TABLE products ADD CONSTRAINT fk_products_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    
ALTER TABLE knowledge_documents ADD CONSTRAINT fk_knowledge_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    
ALTER TABLE contacts ADD CONSTRAINT fk_contacts_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    
ALTER TABLE staff_users ADD CONSTRAINT fk_staff_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;
    
ALTER TABLE quotes ADD CONSTRAINT fk_quotes_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    
ALTER TABLE appointments ADD CONSTRAINT fk_appointments_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    
ALTER TABLE handoffs ADD CONSTRAINT fk_handoffs_business 
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
