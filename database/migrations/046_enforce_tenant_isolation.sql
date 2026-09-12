-- Enforce tenant-aware identity and lookup keys after multi-tenancy migration.
SET search_path TO public;

-- Existing data was assigned by migration 045. Stop new rows from bypassing tenant scope.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM contacts WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM conversations WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM products WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM knowledge_documents WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM quotes WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM appointments WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM handoffs WHERE business_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot enforce tenant isolation while tenant-owned rows have NULL business_id';
    END IF;
END $$;

ALTER TABLE contacts ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE knowledge_documents ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE quotes ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE handoffs ALTER COLUMN business_id SET NOT NULL;

-- A customer phone can exist in more than one tenant; it is not globally unique.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_business_phone
    ON contacts (business_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_businesses_waha_session
    ON businesses (waha_session_name)
    WHERE waha_session_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_business_contact
    ON conversations (business_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_quotes_business_contact
    ON quotes (business_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_business_contact
    ON appointments (business_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_business_conversation
    ON handoffs (business_id, conversation_id);
