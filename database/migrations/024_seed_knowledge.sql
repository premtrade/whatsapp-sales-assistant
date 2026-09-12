-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : 3 (Stage 1)
-- File    : 024_seed_knowledge.sql
-- Purpose : Seed a small FAQ knowledge base so Workflow 03's
--           relevance retrieval (pg_trgm similarity) and the AI
--           grounding have deterministic content to reason from.
--           Idempotent: re-runs leave a single document/chunk set.
-- ==========================================================

BEGIN;

-- ---------------------------------------------------------------- Garco Services FAQ
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM knowledge_documents WHERE title = 'Garco Services FAQ') THEN
        INSERT INTO knowledge_documents (title, document_type, source, language, status, metadata)
        VALUES ('Garco Services FAQ', 'faq', 'seed', 'en', 'indexed',
                jsonb_build_object('category', 'sales', 'authoritative', true));
    END IF;
END
$$;

WITH d AS (SELECT id FROM knowledge_documents WHERE title = 'Garco Services FAQ')
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT d.id, n, txt, 'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('source_doc', 'Garco Services FAQ')
FROM d,
     (VALUES
        (1, 'Garco Construction Services Limited offers general construction, renovation, project management, roofing, dry wall, ceilings, painting, electrical, plumbing, A/C, and iron works across Jamaica.'),
        (2, 'Garco has in-house design-build capabilities with architects, engineers, CAD technicians, and project managers on staff. Established in 1999.')
     ) AS v(n, txt)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

-- ---------------------------------------------------------------- Pricing FAQ
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM knowledge_documents WHERE title = 'Pricing & Payments FAQ') THEN
        INSERT INTO knowledge_documents (title, document_type, source, language, status, metadata)
        VALUES ('Pricing & Payments FAQ', 'faq', 'seed', 'en', 'indexed',
                jsonb_build_object('category', 'sales'));
    END IF;
END
$$;

WITH d AS (SELECT id FROM knowledge_documents WHERE title = 'Pricing & Payments FAQ')
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT d.id, n, txt, 'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('source_doc', 'Pricing & Payments FAQ')
FROM d,
     (VALUES
        (1, 'Payments are accepted via bank transfer, card or cash after service completion. Invoices are valid for 30 days from issue.'),
        (2, 'We do not offer financing; the full amount is due before we schedule any construction work.')
     ) AS v(n, txt)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

COMMIT;
