-- Remove the remaining demo roof product and FAQ from the active assistant context.
UPDATE products
SET active = false
WHERE sku = 'ROOF-001'
  AND name = 'Roof Inspection'
  AND price = 15000;

DELETE FROM knowledge_chunks
WHERE document_id IN (
  SELECT id
  FROM knowledge_documents
  WHERE title = 'Roof Inspection FAQ'
    AND source = 'seed'
);

DELETE FROM knowledge_documents
WHERE title = 'Roof Inspection FAQ'
  AND source = 'seed';
