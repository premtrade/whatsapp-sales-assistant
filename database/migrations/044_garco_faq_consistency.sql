-- ==========================================================
-- Garco FAQ consistency additions
-- Purpose: Add explicit answers for recurring customer questions.
-- Idempotent: uses stable chunk numbers and upserts content.
-- ==========================================================

BEGIN;

WITH d AS (
    SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'
),
faq AS (
    SELECT * FROM (VALUES
        (11, 'DESIGN-BUILD CONSULTING: Garco provides design-build consulting through its in-house architects, engineers, CAD technicians, and project managers. The team can support a project from design through construction.'),
        (12, 'QUOTATIONS AND SITE VISITS: Garco does not publish standard prices for site visits or construction services. Pricing is prepared after the project scope and site requirements are reviewed. Ask the customer for the project type, location, and preferred timing, then arrange a consultation or site visit.'),
        (13, 'OFFICE LOCATION: Garco serves the Kingston, Jamaica area. The office address should be confirmed by a Garco representative before it is given to a customer.'),
        (14, 'OPENING HOURS: Garco has no confirmed opening hours in the approved knowledge base. Do not invent or state office hours; connect the customer with a Garco representative for confirmation.'),
        (15, 'LATEST PROJECT: The approved knowledge base does not contain a current or latest project. Do not invent a project name, client, location, status, or completion date; connect the customer with a Garco representative.'),
        (16, 'WEBSITE: Garco Construction Services Limited website: https://www.garcoconstruction.com/')
    ) AS values(chunk_number, chunk_text)
)
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT d.id, faq.chunk_number, faq.chunk_text,
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Customer FAQ', 'authoritative', true)
FROM d CROSS JOIN faq
ON CONFLICT (document_id, chunk_number) DO UPDATE
SET chunk_text = EXCLUDED.chunk_text,
    embedding_model = EXCLUDED.embedding_model,
    metadata = EXCLUDED.metadata;

COMMIT;
