-- ============================================================
-- Migration 061: Contact Inquiries from Landing Page
-- ============================================================
SET search_path TO public;

CREATE TABLE IF NOT EXISTS contact_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    business VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(50),
    message TEXT NOT NULL,
    source VARCHAR(100) NOT NULL DEFAULT 'landing-page',
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email ON contact_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created_at ON contact_inquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_source ON contact_inquiries(source);

DROP TRIGGER IF EXISTS trg_contact_inquiries_updated ON contact_inquiries;
CREATE TRIGGER trg_contact_inquiries_updated
    BEFORE UPDATE ON contact_inquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
