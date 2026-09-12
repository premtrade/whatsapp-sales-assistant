DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM knowledge_documents WHERE title = 'Garco Business Directory') THEN
        INSERT INTO knowledge_documents (title, document_type, source, language, status, metadata)
        VALUES ('Garco Business Directory', 'markdown', 'https://www.garcoconstruction.com/', 'en', 'indexed', jsonb_build_array('authoritative', 'pricing_reference', 'service_catalog', 'contact_info'));
    END IF;
END $$;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 1, 'Garco Construction Services Limited is a general contractor and construction management company established in 1999. It has in-house design-build capabilities and its team includes architects, engineers, CAD technicians, and project managers.', 'text-embedding-3-small', jsonb_build_object('section', 'Company Identity', 'authoritative', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 2, 'Garco performs residential and commercial construction with expertise in concrete work, steel erection, carpentry, and offers design-build projects, general contracting, construction management, consulting, and all construction phases.', 'text-embedding-3-small', jsonb_build_object('section', 'Services', 'authoritative', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 3, 'Garco offers a General Construction Consultation. For specific service pricing including roofing, electrical, plumbing, or other works, customers should contact Garco directly for a customized quote.', 'text-embedding-3-small', jsonb_build_object('section', 'Consultation', 'authoritative', true, 'service', 'general_consultation')
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 4, 'For construction services including general construction, renovation, project management, roofing, electrical, plumbing, painting, and more, customers should contact Garco for a customized quote based on project scope.', 'text-embedding-3-small', jsonb_build_object('section', 'Quotation', 'authoritative', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 5, 'Founder & CEO: Mr. Rohan A. Grant. Contact: Tel 876-908-1970, Fax 876-754-0469, Mobile 876-372-3358, Website https://www.garcoconstruction.com/', 'text-embedding-3-small', jsonb_build_object('section', 'Contact', 'authoritative', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 6, 'Garco has two possible office addresses (conflicting on website): Suite 24F, 4 Lismore Avenue, Kingston 5 or Suite 406, Real Equity Professional Suites, 218 Mountain View Avenue, Kingston 6. Do not claim one as definitive; connect customers to confirm.', 'text-embedding-3-small', jsonb_build_object('section', 'Location', 'authoritative', true, 'requires_confirmation', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 7, 'Garco services include: General Construction/Renovation, Project Management, General Roof Works, Dry Wall Partitions & Ceilings, Suspended Ceilings, Trowel-On Works, Textured Spraying, General Painting Works, Electrical Works, Plumbing Works, A/C Works, General Grille & Iron Works.', 'text-embedding-3-small', jsonb_build_object('section', 'Services List', 'authoritative', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 8, 'Garco business values: Quality of finished product, Innovation, Foresight, Integrity, Quantifiable performance. Maintains professionalism, honesty, and fairness with suppliers, subcontractors, associates, and customers.', 'text-embedding-3-small', jsonb_build_object('section', 'Values', 'authoritative', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 9, 'AI MUST NOT invent prices, business hours, services, employees, project details, completion dates, warranties, payment policies, financing options, appointment availability, or office addresses. Only state facts from this document or approved sources.', 'text-embedding-3-small', jsonb_build_object('section', 'AI Hallucination Rules', 'authoritative', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
SELECT id, 10, 'If customer asks for quote: collect requirements, use quotation workflow. Do not invent pricing. If information missing, ask questions or escalate to human. NEVER invent service prices or hourly rates.', 'text-embedding-3-small', jsonb_build_object('section', 'Quotation Rules', 'authoritative', true)
FROM knowledge_documents WHERE title = 'Garco Business Directory'
ON CONFLICT (document_id, chunk_number) DO NOTHING;
