-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2.5
-- File    : 016_views.sql
-- Purpose : Application Views
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- CUSTOMER PROFILE
-- ==========================================================

CREATE OR REPLACE VIEW vw_customer_profile AS
SELECT
    c.id,
    c.display_name,
    c.phone,
    c.email,
    c.company,
    c.status,
    c.created_at,
    COUNT(DISTINCT conv.id) AS conversations,
    COUNT(msg.id) AS total_messages
FROM contacts c
LEFT JOIN conversations conv
    ON conv.contact_id = c.id
LEFT JOIN messages msg
    ON msg.conversation_id = conv.id
GROUP BY
    c.id,
    c.display_name,
    c.phone,
    c.email,
    c.company,
    c.status,
    c.created_at;

-- ==========================================================
-- ACTIVE CONVERSATIONS
-- ==========================================================

CREATE OR REPLACE VIEW vw_active_conversations AS
SELECT
    conv.id,
    c.display_name,
    c.phone,
    conv.status,
    conv.started_at,
    conv.last_message_at
FROM conversations conv
JOIN contacts c
    ON conv.contact_id = c.id
WHERE conv.status = 'active';

-- ==========================================================
-- QUOTE SUMMARY
-- ==========================================================

CREATE OR REPLACE VIEW vw_quote_summary AS
SELECT
    q.id,
    q.quote_number,
    c.display_name,
    q.status,
    q.total,
    q.currency,
    q.valid_until,
    COUNT(qi.id) AS line_items
FROM quotes q
JOIN contacts c
    ON q.contact_id = c.id
LEFT JOIN quote_items qi
    ON qi.quote_id = q.id
GROUP BY
    q.id,
    q.quote_number,
    c.display_name,
    q.status,
    q.total,
    q.currency,
    q.valid_until;

-- ==========================================================
-- APPOINTMENT SCHEDULE
-- ==========================================================

CREATE OR REPLACE VIEW vw_appointment_schedule AS
SELECT
    a.id,
    a.title,
    c.display_name,
    a.status,
    a.starts_at,
    a.ends_at,
    s.display_name AS assigned_to
FROM appointments a
JOIN contacts c
    ON a.contact_id = c.id
LEFT JOIN staff_users s
    ON a.assigned_to = s.id;

-- ==========================================================
-- KNOWLEDGE BASE
-- ==========================================================

CREATE OR REPLACE VIEW vw_ai_knowledge AS
SELECT
    kc.id,
    kd.title,
    kc.chunk_number,
    kc.chunk_text,
    kc.embedding_model,
    kc.qdrant_point_id
FROM knowledge_chunks kc
JOIN knowledge_documents kd
    ON kc.document_id = kd.id
WHERE kd.status = 'indexed';

-- ==========================================================
-- DASHBOARD METRICS
-- ==========================================================

CREATE OR REPLACE VIEW vw_dashboard_metrics AS
SELECT
(
    SELECT COUNT(*) FROM contacts
) AS total_contacts,

(
    SELECT COUNT(*) FROM conversations
) AS total_conversations,

(
    SELECT COUNT(*) FROM messages
) AS total_messages,

(
    SELECT COUNT(*) FROM quotes
) AS total_quotes,

(
    SELECT COUNT(*) FROM appointments
) AS total_appointments,

(
    SELECT COUNT(*) FROM products
) AS total_products;
