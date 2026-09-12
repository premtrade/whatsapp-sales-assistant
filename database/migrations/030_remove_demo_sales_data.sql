-- Remove demo-only sales data from the active Garco assistant context.
-- Authoritative company facts remain in the Garco Business Directory document.

UPDATE products
SET active = false
WHERE sku = 'GARCO-001'
  AND name = 'General Construction Consultation'
  AND price = 15000;

UPDATE knowledge_documents
SET status = 'archived'
WHERE title = 'Pricing & Payments FAQ'
  AND source = 'seed';

DELETE FROM knowledge_chunks
WHERE document_id IN (
  SELECT id
  FROM knowledge_documents
  WHERE title = 'Pricing & Payments FAQ'
    AND source = 'seed'
);

DELETE FROM knowledge_documents
WHERE title = 'Pricing & Payments FAQ'
  AND source = 'seed';

DELETE FROM contacts c
WHERE c.phone = '+18765551234'
  AND c.email = 'john@example.com'
  AND c.company = 'Garco Construction Services Limited'
  AND NOT EXISTS (SELECT 1 FROM conversations WHERE contact_id = c.id);
