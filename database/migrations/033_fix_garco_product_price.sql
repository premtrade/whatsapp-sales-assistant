-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- File    : 033_fix_garco_product_price.sql
-- Purpose : Garco quotes are custom and require human confirmation.
--           Remove the hardcoded demo price from the seeded
--           "General Construction Consultation" product and mark
--           it for human approval so the assistant never presents
--           an invented/authoritative price to a customer.
-- ==========================================================

SET search_path TO public;

UPDATE products
SET
    price = NULL,
    currency = 'JMD',
    metadata = COALESCE(metadata, '{}'::jsonb)
               || '{"requires_human_approval": true}'::jsonb,
    updated_at = NOW()
WHERE sku = 'GARCO-001';
