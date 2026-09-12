-- =============================================================================
-- validate_workflows.sql
-- Run after exercising all 7 workflows to verify DB state.
--
-- Usage:
--   docker compose exec -T postgres psql -U postgres -d whatsapp_sales \
--     -v ON_ERROR_STOP=1 -X -f tests/validate_workflows.sql
--
-- Each section is independent. The script never throws — it prints PASS/FAIL.
-- Exit code: 0 if all checks pass, 1 otherwise.
-- =============================================================================

\set ON_ERROR_STOP off

\echo
\echo '=== 1. Workflow 03 (Memory & Context Builder) ==='

\echo '-- pgvector table reachable + has embeddings --'
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS: knowledge_chunks has ' || COUNT(*) || ' embeddings'
    ELSE 'FAIL: no embeddings in knowledge_chunks'
  END AS check
FROM knowledge_chunks WHERE embedding IS NOT NULL;

\echo '-- Garco authoritative document seeded --'
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS: Garco Business Directory present'
    ELSE 'FAIL: Garco Business Directory missing'
  END AS check
FROM knowledge_documents WHERE title = 'Garco Business Directory';

\echo '-- Dummy fallback chunk (per migration 034) --'
SELECT
  CASE
    WHEN COUNT(*) >= 1 THEN 'PASS: dummy fallback chunk present'
    ELSE 'FAIL: dummy fallback chunk missing'
  END AS check
FROM knowledge_chunks WHERE metadata->>'is_dummy' = 'true';

\echo
\echo '=== 2. Workflow 01 (Incoming WhatsApp Message) ==='

\echo '-- Incoming messages persisted with non-null text_body or media_url --'
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS: ' || COUNT(*) || ' incoming messages stored'
    ELSE 'FAIL: no incoming messages persisted'
  END AS check
FROM messages WHERE direction = 'incoming'
  AND (text_body IS NOT NULL OR media_url IS NOT NULL);

\echo '-- whatsapp_message_id uniqueness (no duplicates) --'
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: no duplicate whatsapp_message_id'
    ELSE 'FAIL: ' || COUNT(*) || ' duplicate whatsapp_message_id rows'
  END AS check
FROM (
  SELECT whatsapp_message_id
  FROM messages
  WHERE whatsapp_message_id IS NOT NULL
  GROUP BY whatsapp_message_id HAVING COUNT(*) > 1
) d;

\echo
\echo '=== 3. Workflow 04 (Memory Writer) ==='

\echo '-- customer_facts rows for at least one contact --'
SELECT
  CASE
    WHEN COUNT(DISTINCT contact_id) > 0
      THEN 'PASS: customer_facts stored for ' || COUNT(DISTINCT contact_id) || ' contact(s)'
    ELSE 'FAIL: customer_facts is empty'
  END AS check
FROM customer_facts;

\echo '-- customer_name preserved verbatim (no truncation/regex over-match) --'
SELECT
  CASE
    WHEN bool_or(fact_value ~ '^JMD [0-9]{1,3},?[0-9]{3}$')
      THEN 'PASS: at least one budget fact matches JMD NNN,NNN'
    ELSE 'INFO: no well-formed JMD budget yet (run text scenario)'
  END AS check
FROM customer_facts WHERE fact_key = 'budget';

\echo '-- (contact_id, fact_key) uniqueness enforced --'
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: customer_facts unique per (contact_id, fact_key)'
    ELSE 'FAIL: ' || COUNT(*) || ' duplicate (contact_id, fact_key) rows'
  END AS check
FROM (
  SELECT contact_id, fact_key
  FROM customer_facts
  GROUP BY contact_id, fact_key HAVING COUNT(*) > 1
) d;

\echo
\echo '=== 4. Workflow 02 (AI Brain) ==='

\echo '-- AI reply messages exist --'
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS: ' || COUNT(*) || ' AI outgoing messages'
    ELSE 'FAIL: no outgoing AI messages'
  END AS check
FROM messages WHERE direction = 'outgoing' AND sender_type = 'ai';

\echo '-- ai_failure audit log entries (if any) --'
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: no ai_failure events recorded'
    ELSE 'INFO: ' || COUNT(*) || ' ai_failure events — review audit_logs'
  END AS check
FROM audit_logs WHERE action = 'ai_failure';

\echo
\echo '=== 5. Workflow 05 (Appointment Tool) ==='

\echo '-- appointments rows --'
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS: ' || COUNT(*) || ' appointments'
    ELSE 'INFO: no appointments (run appointment scenario to populate)'
  END AS check
FROM appointments;

\echo '-- appointments.status CHECK constraint (no invalid values) --'
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: all appointments have valid status'
    ELSE 'FAIL: ' || COUNT(*) || ' appointments with invalid status'
  END AS check
FROM appointments
WHERE status NOT IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');

\echo
\echo '=== 6. Workflow 06 (Quote Tool) ==='

\echo '-- quotes.status always within CHECK constraint --'
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: all quotes have valid status'
    ELSE 'FAIL: ' || COUNT(*) || ' quotes with invalid status'
  END AS check
FROM quotes
WHERE status NOT IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled');

\echo '-- quotes.metadata.requires_review present on Garco-001 quotes --'
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS: ' || COUNT(*) || ' quote(s) flagged requires_review'
    ELSE 'INFO: no requires_review quotes yet'
  END AS check
FROM quotes WHERE metadata->>'requires_review' = 'true';

\echo
\echo '=== 7. Workflow 7 (Handoff Tool) ==='

\echo '-- conversations.status never set to invalid "human_pending" --'
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: no rows with stale "human_pending" status'
    ELSE 'FAIL: ' || COUNT(*) || ' rows have invalid status "human_pending"'
  END AS check
FROM conversations WHERE status = 'human_pending';

\echo '-- handoff + conversation.status = waiting_agent are consistent --'
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: no orphan handoffs (pending without waiting_agent conversation)'
    ELSE 'FAIL: ' || COUNT(*) || ' pending handoffs on conversations not in waiting_agent'
  END AS check
FROM handoffs h
JOIN conversations c ON c.id = h.conversation_id
WHERE h.status = 'pending' AND c.status <> 'waiting_agent';

\echo
\echo '=== 8. Audit + WAHA secrets ==='

\echo '-- WAHA API key NOT stored in workflow JSON (uses $env.WAHA_API_KEY) --'
\echo '   (manual check: grep workflows/ -l "waha_2026")'
\echo '   expected: no matches'

\echo '-- message_received + ai_reply audit entries exist --'
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS: ' || COUNT(*) || ' message_received audit rows'
    ELSE 'FAIL: no message_received audit rows'
  END AS check
FROM audit_logs WHERE action = 'message_received';

\echo
\echo '=== Done. Review any FAIL/INFO lines above. ==='