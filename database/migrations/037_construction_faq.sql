-- ==========================================================
-- Construction FAQ Knowledge Base
-- File: 037_construction_faq.sql
-- Description: Adds construction-specific FAQ entries
-- ==========================================================

SET search_path TO public;

-- Insert construction FAQ knowledge chunks
INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, token_count, embedding_model, metadata)
SELECT 
    kd.id,
    1,
    'FREQUENTLY ASKED QUESTIONS - GARCO CONSTRUCTION SERVICES

Q: What services does Garco Construction offer?
A: Garco Construction Services offers: General Construction, Renovation, Project Management, Roof Works, Dry Wall Partitions & Ceilings, Suspended Ceilings, Trowel-On Works, Textured Spraying, General Painting Works, Electrical Works, Plumbing Works, A/C Works, and General Grille & Iron Works.

Q: How long has Garco Construction been in business?
A: Garco Construction Services Limited was established in 1999 and has been serving Jamaica for over 25 years.

Q: Who is the owner/founder of Garco Construction?
A: Garco Construction was founded by Mr. Rohan A. Grant, a veteran in the construction industry who provides a full range of services from design through construction.

Q: Does Garco Construction offer design-build services?
A: Yes, Garco Construction has in-house design-build capabilities with a team that includes architects, engineers, CAD technicians, and project managers.

Q: What areas does Garco Construction serve?
A: Garco Construction serves the Kingston, Jamaica area. For projects outside this area, please contact us to confirm service availability.

Q: How can I get a quote for my project?
A: You can request a quote by sending us a message with details about your project including: type of work needed, location, approximate budget, and timeline. A representative will respond with next steps.

Q: Does Garco Construction handle both residential and commercial projects?
A: Yes, Garco Construction handles both residential and commercial construction projects of various sizes.

Q: What is the typical timeline for a construction project?
A: Project timelines vary based on scope and complexity. Small renovations may take 2-4 weeks, while larger construction projects can take several months. We will provide a timeline estimate after assessing your project.

Q: Does Garco Construction obtain necessary permits?
A: Yes, Garco Construction can assist with obtaining necessary building permits for your project. Please discuss this with our team during the planning phase.

Q: What payment methods does Garco Construction accept?
A: Payment terms are discussed on a project-by-project basis. Generally, we require a deposit before work begins with progress payments throughout the project. Full payment is due upon completion.',
    350,
    'text-embedding-3-small',
    '{"source": "faq", "category": "frequently_asked_questions", "language": "en"}'::jsonb
FROM knowledge_documents kd
WHERE kd.title = 'Garco Construction Services Ltd. - Knowledge Base FAQ'
LIMIT 1;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, token_count, embedding_model, metadata)
SELECT 
    kd.id,
    2,
    'PAYMENT TERMS AND POLICIES - GARCO CONSTRUCTION

PAYMENT POLICY:
- Garco Construction does not offer financing or payment plans
- Full payment is required before work begins
- For larger projects, a payment schedule may be arranged:
  * Deposit: 30-50% before work begins
  * Progress payments: As milestones are reached
  * Final payment: Upon project completion
- Acceptable payment methods: Bank transfer, manager''s check, or cash (with receipt)
- A formal contract will be provided before work begins
- All prices are in Jamaican Dollars (JMD) unless otherwise stated

WARRANTY INFORMATION:
- Workmanship warranty is provided on all projects
- Warranty duration varies by service type:
  * Roofing: 5-year warranty on workmanship
  * Electrical: 1-year warranty on installations
  * Plumbing: 1-year warranty on workmanship
  * Painting: 6-month warranty on interior, 3-month on exterior
- Material warranties are handled through the manufacturer
- Warranty does not cover damage from misuse, neglect, or natural disasters

CANCELLATION POLICY:
- Contracts may be cancelled within 3 days of signing with full refund of deposit
- After 3 days, deposit may be forfeited to cover planning and preparation costs
- If work has begun, customer is responsible for payment for work completed to date',
    250,
    'text-embedding-3-small',
    '{"source": "faq", "category": "payment_terms", "language": "en"}'::jsonb
FROM knowledge_documents kd
WHERE kd.title = 'Garco Construction Services Ltd. - Knowledge Base FAQ'
LIMIT 1;

INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, token_count, embedding_model, metadata)
SELECT 
    kd.id,
    3,
    'PROJECT PROCESS - GARCO CONSTRUCTION

STEP 1: INITIAL CONTACT
- Customer contacts Garco via WhatsApp, phone, or website
- Basic project information is gathered
- Preliminary discussion of scope and budget

STEP 2: SITE VISIT AND ASSESSMENT
- A Garco representative visits the project site
- Detailed measurements and photos are taken
- Specific requirements and challenges are identified
- Customer questions are answered

STEP 3: QUOTE PREPARATION
- Detailed quote is prepared based on site assessment
- Quote includes: materials, labor, timeline, and total cost
- Quote is sent to customer for review
- Customer can request modifications or ask questions

STEP 4: CONTRACT SIGNING
- Once quote is approved, a formal contract is prepared
- Payment terms are agreed upon
- Project start date is confirmed
- Required permits are identified

STEP 5: PROJECT EXECUTION
- Work begins according to agreed schedule
- Progress updates are provided to customer
- Quality checks are performed throughout
- Any changes are documented and approved

STEP 6: COMPLETION AND HANDOVER
- Final inspection is conducted with customer
- Punch list items are addressed
- Final payment is collected
- Warranty information is provided
- Customer feedback is requested

SITE VISIT INFORMATION:
- Site visits are typically scheduled Monday-Friday, 9am-4pm
- Someone 18+ must be present during the visit
- Please ensure site is accessible (unlock gates, secure pets)
- Have any relevant documents ready (property surveys, existing plans)
- The visit typically takes 30-60 minutes depending on project scope',
    350,
    'text-embedding-3-small',
    '{"source": "faq", "category": "project_process", "language": "en"}'::jsonb
FROM knowledge_documents kd
WHERE kd.title = 'Garco Construction Services Ltd. - Knowledge Base FAQ'
LIMIT 1;