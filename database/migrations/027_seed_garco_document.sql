-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint  : 3 (Stage 3)
-- File    : 027_seed_garco_document.sql
-- Purpose : Seed the authoritative Garco business document for RAG.
--           This document provides grounding to prevent AI hallucination
--           of prices, services, policies, and business facts.
--           Idempotent: re-runs leave a single document/chunk set.
-- ==========================================================

BEGIN;

-- ---------------------------------------------------------------- Garco Business Document
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM knowledge_documents WHERE title = 'Garco Business Directory') THEN
        INSERT INTO knowledge_documents 
            (title, document_type, source, language, status, metadata)
        VALUES 
            ('Garco Business Directory', 'markdown', 'https://www.garcoconstruction.com/', 'en', 'indexed',
            jsonb_build_array('authoritative', 'pricing_reference', 'service_catalog', 'contact_info'));
    END IF;
END
$$;


-- Company Identity & Background chunks (1-5)
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 1, 
       'Garco Construction Services Limited is a general contractor and construction management company established in 1999. It has in-house design-build capabilities and its team includes architects, engineers, CAD technicians, and project managers.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Company Identity', 'authoritative', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 2,
       'Garco performs residential and commercial construction with expertise in concrete work, steel erection, carpentry, and offers design-build projects, general contracting, construction management, consulting, and all construction phases.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Services', 'authoritative', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 3,
       'Garco offers a General Construction Consultation. For specific service pricing including roofing, electrical, plumbing, or other works, customers should contact Garco directly for a customized quote.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Consultation', 'authoritative', true, 'service', 'general_consultation')
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 4,
       'For construction services including general construction, renovation, project management, roofing, electrical, plumbing, painting, and more, customers should contact Garco for a customized quote based on project scope.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Quotation', 'authoritative', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

-- Founder & Contact Info (5-8)
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 5,
       'Founder & CEO: Mr. Rohan A. Grant. Contact: Tel 876-908-1970, Fax 876-754-0469, Mobile 876-372-3358, Website https://www.garcoconstruction.com/',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Contact', 'authoritative', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

-- Location Info (6-7)
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 6,
       'Garco has two possible office addresses (conflicting on website): Suite 24F, 4 Lismore Avenue, Kingston 5 or Suite 406, Real Equity Professional Suites, 218 Mountain View Avenue, Kingston 6. Do not claim one as definitive; connect customers to confirm.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Location', 'authoritative', true, 'requires_confirmation', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

-- Services List (8-9)
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 7,
       'Garco services include: General Construction/Renovation, Project Management, General Roof Works, Dry Wall Partitions & Ceilings, Suspended Ceilings, Trowel-On Works, Textured Spraying, General Painting Works, Electrical Works, Plumbing Works, A/C Works, General Grille & Iron Works.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Services List', 'authoritative', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 8,
       'Garco business values: Quality of finished product, Innovation, Foresight, Integrity, Quantifiable performance. Maintains professionalism, honesty, and fairness with suppliers, subcontractors, associates, and customers.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Values', 'authoritative', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

-- AI Rules (9-10)
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 9,
       'AI MUST NOT invent prices, business hours, services, employees, project details, completion dates, warranties, payment policies, financing options, appointment availability, or office addresses. Only state facts from this document or approved sources.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'AI Hallucination Rules', 'authoritative', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT (SELECT id FROM knowledge_documents WHERE title = 'Garco Business Directory'), 10,
       'If customer asks for quote: collect requirements, use quotation workflow. Do not invent pricing. If information missing, ask questions or escalate to human. NEVER invent service prices or hourly rates.',
       'sentence-transformers/distilbert-base-nli-mean-tokens',
       jsonb_build_object('section', 'Quotation Rules', 'authoritative', true)
ON CONFLICT (document_id, chunk_number) DO NOTHING;

COMMIT;