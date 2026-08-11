-- ==========================================================
-- Project : WhatsApp Sales Assistant
-- Sprint 2.5
-- File    : 018_validation.sql
-- Purpose : Database Validation
-- ==========================================================

SET search_path TO public;

-- ==========================================================
-- EXTENSIONS
-- ==========================================================

SELECT
    extname AS installed_extension
FROM pg_extension
WHERE extname IN
(
    'pgcrypto',
    'uuid-ossp',
    'citext'
)
ORDER BY extname;

-- ==========================================================
-- TABLES
-- ==========================================================

SELECT
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN
(
    'contacts',
    'conversations',
    'messages',
    'products',
    'quotes',
    'quote_items',
    'appointments',
    'knowledge_documents',
    'knowledge_chunks',
    'staff_users',
    'handoffs',
    'settings',
    'audit_logs'
)
ORDER BY table_name;

-- ==========================================================
-- VIEWS
-- ==========================================================

SELECT
    table_name
FROM information_schema.views
WHERE table_schema='public'
ORDER BY table_name;

-- ==========================================================
-- FOREIGN KEYS
-- ==========================================================

SELECT
    conname,
    conrelid::regclass AS table_name
FROM pg_constraint
WHERE contype='f'
ORDER BY table_name, conname;

-- ==========================================================
-- TRIGGERS
-- ==========================================================

SELECT
    event_object_table,
    trigger_name
FROM information_schema.triggers
WHERE trigger_schema='public'
ORDER BY event_object_table;

-- ==========================================================
-- FUNCTION
-- ==========================================================

SELECT
    proname
FROM pg_proc
WHERE proname='update_timestamp';

-- ==========================================================
-- ROW COUNTS
-- ==========================================================

SELECT 'contacts' AS table_name, COUNT(*) FROM contacts
UNION ALL
SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL
SELECT 'messages', COUNT(*) FROM messages
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'quotes', COUNT(*) FROM quotes
UNION ALL
SELECT 'quote_items', COUNT(*) FROM quote_items
UNION ALL
SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL
SELECT 'knowledge_documents', COUNT(*) FROM knowledge_documents
UNION ALL
SELECT 'knowledge_chunks', COUNT(*) FROM knowledge_chunks
UNION ALL
SELECT 'staff_users', COUNT(*) FROM staff_users
UNION ALL
SELECT 'handoffs', COUNT(*) FROM handoffs
UNION ALL
SELECT 'settings', COUNT(*) FROM settings
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs
ORDER BY table_name;

-- ==========================================================
-- DASHBOARD VIEW
-- ==========================================================

SELECT *
FROM vw_dashboard_metrics;

-- ==========================================================
-- MEMORY LAYER (added after core schema)
-- =========================================================

SELECT 'customer_facts' AS table_name, COUNT(*) FROM customer_facts
UNION ALL
SELECT 'conversation_summaries', COUNT(*) FROM conversation_summaries
UNION ALL
SELECT 'memory_embeddings', COUNT(*) FROM memory_embeddings
ORDER BY table_name;

-- ==========================================================
-- CONVERSATION SALES-STATE COLUMNS (added by 022_sales_state)
-- =========================================================

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'conversations'
  AND column_name IN (
      'conversation_state',
      'lead_stage',
      'lead_status',
      'priority',
      'qualification_score',
      'sales_metadata'
  )
ORDER BY ordinal_position;

-- ==========================================================
-- SALES-STATE CHECK CONSTRAINTS
-- =========================================================

SELECT conname, contype
FROM pg_constraint
WHERE conname IN (
      'conversations_conversation_state_check',
      'conversations_lead_stage_check',
      'conversations_lead_status_check',
      'conversations_priority_check',
      'conversations_qualification_score_check'
  )
ORDER BY conname;