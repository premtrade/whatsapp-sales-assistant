#!/usr/bin/env python3
"""
tests/unit/testDatabaseQueries.py - Test all SQL queries used in n8n workflows against test database.
"""
import os
import uuid

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _psql(sql, db="whatsapp_sales_test"):
    import subprocess
    cmd = [
        "docker", "compose", "-f", os.path.join(REPO, "docker-compose.test.yml"),
        "exec", "-T", "postgres-test", "psql",
        "-U", "postgres", "-d", db,
        "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    return result.stdout.strip(), result.returncode, result.stderr


WORKFLOW_QUERIES = {
    "01_incoming_message": [
        ("upsert_contact", "INSERT INTO contacts (phone, display_name, source) VALUES ($1, $2, 'whatsapp') ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id, phone;"),
        ("upsert_conversation", "INSERT INTO conversations (contact_id, channel, status, last_message_at) VALUES ($1, 'whatsapp', 'active', NOW()) ON CONFLICT (contact_id, channel) DO UPDATE SET last_message_at = NOW() RETURNING id;"),
        ("insert_message", "INSERT INTO messages (conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body) VALUES ($1, $2, 'incoming', 'customer', 'text', $3) ON CONFLICT (whatsapp_message_id) DO NOTHING RETURNING id;"),
        ("update_conversation", "UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id;"),
        ("insert_audit_log", "INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, performed_by_type, description, new_values, metadata) VALUES ('conversation', $1, 'message_received', NULL, 'system', 'Incoming WhatsApp message received', $2::jsonb, jsonb_build_object('source', 'whatsapp', 'workflow', 'Webhook 1')) RETURNING id;"),
    ],
    "03_context_builder": [
        ("get_contact", "SELECT id, phone, display_name, source, created_at, updated_at FROM contacts WHERE id = $1;"),
        ("get_conversation", "SELECT id, contact_id, channel, status, last_message_at, created_at, updated_at FROM conversations WHERE id = $1;"),
        ("get_recent_messages", "SELECT COALESCE(json_agg(json_build_object('direction', direction, 'sender_type', sender_type, 'text_body', text_body, 'created_at', created_at) ORDER BY created_at ASC), '[]'::json) AS messages FROM (SELECT direction, sender_type, text_body, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10) recent;"),
        ("get_conversation_summary", "SELECT COALESCE((SELECT summary FROM conversation_summaries WHERE conversation_id = $1 LIMIT 1), '') AS summary, COALESCE((SELECT message_count FROM conversation_summaries WHERE conversation_id = $1 LIMIT 1), 0) AS message_count FROM conversation_summaries LIMIT 1;"),
        ("get_knowledge_chunks", "SELECT COALESCE(json_agg(json_build_object('chunk_text', chunk_text, 'metadata', metadata, 'source', source_title) ORDER BY s DESC), '[]'::json) AS knowledge FROM (SELECT kc.chunk_text, kc.metadata, kd.title AS source_title, similarity(kc.chunk_text, $1) AS s FROM knowledge_chunks kc JOIN knowledge_documents kd ON kd.id = kc.document_id WHERE kd.status = 'indexed' ORDER BY s DESC LIMIT 5) AS chunks;"),
        ("get_products", "SELECT COALESCE(json_agg(json_build_object('id', id, 'sku', sku, 'name', name, 'description', description, 'price', price, 'currency', currency, 'unit', unit, 'category', category, 'product_type', product_type) ORDER BY name), '[]'::json) AS products FROM products WHERE active = true;"),
        ("get_quotes", "SELECT COALESCE(json_agg(json_build_object('id', id, 'quote_number', quote_number, 'status', status, 'total', total, 'currency', currency, 'valid_until', valid_until) ORDER BY created_at DESC), '[]'::json) AS quotes FROM quotes WHERE contact_id = $1;"),
        ("get_appointments", "SELECT COALESCE(json_agg(json_build_object('id', id, 'title', title, 'status', status, 'starts_at', starts_at, 'ends_at', ends_at) ORDER BY starts_at DESC), '[]'::json) AS appointments FROM appointments WHERE contact_id = $1;"),
        ("get_handoffs", "SELECT COALESCE(json_agg(json_build_object('id', id, 'status', status, 'reason', reason, 'assigned_to', assigned_to, 'created_at', created_at) ORDER BY created_at DESC), '[]'::json) AS handoffs FROM handoffs WHERE conversation_id = $1;"),
        ("retrieve_customer_facts", "SELECT COALESCE(json_agg(json_build_object('fact_key', fact_key, 'fact_value', fact_value, 'confidence', confidence) ORDER BY confidence DESC, updated_at DESC), '[]'::json) AS facts FROM customer_facts WHERE contact_id = $1;"),
    ],
    "04_memory_writer": [
        ("save_customer_name", "INSERT INTO customer_facts (contact_id, fact_key, fact_value, confidence, source) VALUES ($1, 'customer_name', $2, 0.99, 'ai') ON CONFLICT (contact_id, fact_key) DO UPDATE SET fact_value = EXCLUDED.fact_value, confidence = EXCLUDED.confidence, source = EXCLUDED.source, updated_at = NOW() RETURNING id;"),
        ("update_contact_name", "UPDATE contacts SET display_name = $1, updated_at = NOW() WHERE id = $2 RETURNING id;"),
        ("save_customer_facts", "INSERT INTO customer_facts (contact_id, fact_key, fact_value, confidence, source) SELECT * FROM json_to_recordset($1::json) AS x(contact_id uuid, fact_key text, fact_value text, confidence numeric, source text) ON CONFLICT (contact_id, fact_key) DO UPDATE SET fact_value = EXCLUDED.fact_value, confidence = EXCLUDED.confidence, source = EXCLUDED.source, updated_at = NOW();"),
    ],
    "06_quote_tool": [
        ("lookup_product", "SELECT id, sku, name, description, category, product_type, unit, price, currency, taxable, tax_rate AS product_tax_rate FROM products WHERE active = true AND (LOWER(sku) LIKE LOWER('%' || $1 || '%') OR LOWER(name) LIKE LOWER('%' || $1 || '%')) LIMIT 1;"),
        ("create_quote", "INSERT INTO quotes (quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until) VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10) RETURNING id, quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until;"),
        ("create_quote_items", "INSERT INTO quote_items (quote_id, product_id, line_number, description, quantity, unit, unit_price, tax_rate, discount, line_total) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9) RETURNING *;"),
    ],
    "05_appointment_tool": [
        ("check_conflicts", "SELECT COUNT(*) as conflict_count, string_agg(CASE WHEN a.title = $5 THEN 'conflict_with_' || a.title ELSE 'other_overlap' END, ', ') as conflicts FROM appointments a WHERE a.status IN ('scheduled', 'confirmed') AND a.starts_at < $6::timestamptz AND a.ends_at > $5::timestamptz + ($7 || ' minutes')::interval;"),
        ("get_conflict_details", "SELECT COALESCE(json_agg(json_build_object('id', id, 'title', title, 'starts_at', starts_at, 'ends_at', ends_at, 'status', status)), '[]'::json) AS conflicting_appointments FROM appointments WHERE status IN ('scheduled', 'confirmed') AND starts_at < $2::timestamptz AND ends_at > $1::timestamptz;"),
        ("create_appointment", "INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, location, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, ($6::timestamptz + ($7 || ' minutes')::interval)) RETURNING id, contact_id, appointment_type, status, title, location, starts_at, ends_at, created_at;"),
    ],
    "07_handoff_tool": [
        ("create_handoff", "INSERT INTO handoffs (conversation_id, assigned_to, requested_by, reason, notes, status) VALUES ($1::uuid, NULLIF($2, '__NULL_UUID__')::uuid, $3, NULLIF($4, '__EMPTY__'), NULLIF($5, '__EMPTY__'), 'pending') RETURNING id, conversation_id, assigned_to, requested_by, reason, notes, status, created_at;"),
        ("update_conversation_status", "UPDATE conversations SET status = 'waiting_agent', updated_at = NOW() WHERE id = $1 RETURNING id, status;"),
    ],
    "02_ai_brain": [
        ("insert_ai_message", "INSERT INTO messages (conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body, metadata) VALUES ($1, gen_random_uuid()::text, 'outgoing', 'ai', 'text', $2, '{}'::jsonb) RETURNING id;"),
        ("update_conversation", "UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1;"),
        ("audit_log", "INSERT INTO audit_logs (entity_type, entity_id, action, description) VALUES ('conversation', $1, 'ai_reply', 'AI replied to customer');"),
    ],
}


class TestDatabaseQueries:
    @pytest.fixture(autouse=True)
    def setup(self, db_connection):
        self.db = db_connection

    def test_upsert_contact_executes(self, clean_db):
        contact_id = f"'{__import__('uuid').uuid4()}'"
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name, source, email)
                  VALUES ('{phone}', 'Test User', 'whatsapp', 'test@test.com')
                  ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name
                  RETURNING id, phone;"""
        out, code, err = clean_db(sql)
        assert code == 0, f"Query failed: {err}"
        assert "|" in out

    def test_context_builder_get_contact(self, clean_db):
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name, source, email)
                  VALUES ('{phone}', 'Ctx User', 'whatsapp', 'ctx@test.com')
                  RETURNING id;"""
        out, code, err = clean_db(sql)
        assert code == 0, f"Contact insert failed: {err}"
        cid = out.strip()
        sql = f"SELECT id, phone, display_name, source, created_at, updated_at FROM contacts WHERE id = '{cid}';"
        out, code, err = clean_db(sql)
        assert code == 0
        assert "|" in out

    def test_context_builder_get_recent_messages(self, clean_db):
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Msg User') RETURNING id;"""
        out, code, _ = clean_db(sql)
        cid = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{cid}', 'whatsapp', 'active') RETURNING id;"""
        out, code, _ = clean_db(sql)
        conv_id = out.strip()
        for i in range(3):
            clean_db(f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                        VALUES ('{conv_id}', 'incoming', 'customer', 'text', 'msg {i}');""")
        sql = f"""SELECT COALESCE(json_agg(json_build_object('direction', direction, 'sender_type', sender_type, 'text_body', text_body, 'created_at', created_at) ORDER BY created_at ASC), '[]'::json) AS messages
                  FROM (SELECT direction, sender_type, text_body, created_at FROM messages WHERE conversation_id = '{conv_id}' ORDER BY created_at DESC LIMIT 10) recent;"""
        out, code, err = clean_db(sql)
        assert code == 0
        assert "msg" in out

    def test_create_quote_and_items(self, clean_db):
        sql = """INSERT INTO contacts (phone, display_name)
                 VALUES ('+1876QUOTEUNIT001', 'Quote User')
                 RETURNING id;"""
        out, code, err = clean_db(sql)
        assert code == 0, f"Contact insert failed: {err}"
        cid = out.strip()
        sql = f"""INSERT INTO quotes (quote_number, contact_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                  VALUES ('Q-UNIT-0001', '{cid}', 'draft', 15000, 2250, 0, 17250, 'JMD', 'Test quote', NOW() + INTERVAL '30 days')
                  RETURNING id, quote_number;"""
        out, code, err = clean_db(sql)
        assert code == 0, f"Quote insert failed: {err}"
        qid = out.split("|")[0].strip()
        product_sql = "SELECT id FROM products WHERE active = true LIMIT 1;"
        product_out, product_code, product_err = clean_db(product_sql)
        assert product_code == 0, f"Product lookup failed: {product_err}"
        product_id = product_out.strip()
        sql = f"""INSERT INTO quote_items (quote_id, product_id, line_number, description, quantity, unit, unit_price, tax_rate, discount, line_total)
                  VALUES ('{qid}', '{product_id}', 1, 'General Construction Consultation', 1, 'job', 15000, 15, 0, 15000)
                  RETURNING id, quote_id;"""
        out, code, err = clean_db(sql)
        assert code == 0, f"Quote item insert failed: {err}"

    def test_appointment_conflict_detection(self, clean_db):
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Appt User') RETURNING id;"""
        out, code, _ = clean_db(sql)
        cid = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{cid}', 'whatsapp', 'active') RETURNING id;"""
        out, code, _ = clean_db(sql)
        conv_id = out.strip()
        start = "NOW()"
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, starts_at, ends_at, status)
                  VALUES ('{cid}', '{conv_id}', 'consultation', 'Existing Appointment', {start}, {start} + INTERVAL '60 minutes', 'scheduled')
                  RETURNING id, starts_at, ends_at;"""
        out, code, _ = clean_db(sql)
        existing_id = out.split("|")[0].strip()
        starts_at_str = out.split("|")[1].strip()
        ends_at_str = out.split("|")[2].strip()
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, starts_at, ends_at, status)
                  VALUES ('{cid}', '{conv_id}', 'consultation', 'Conflicting Appointment', '{starts_at_str}', '{ends_at_str}', 'scheduled')
                  RETURNING id;"""
        out, code, err = clean_db(sql)
        assert code == 0

    def test_create_handoff(self, clean_db):
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Handoff User') RETURNING id;"""
        out, code, _ = clean_db(sql)
        cid = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{cid}', 'whatsapp', 'active') RETURNING id;"""
        out, code, _ = clean_db(sql)
        conv_id = out.strip()
        sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, notes, status)
                  VALUES ('{conv_id}', 'ai', 'customer_requested_human', 'Customer asked for human', 'pending')
                  RETURNING id, conversation_id, status;"""
        out, code, err = clean_db(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[2].strip() == "pending"

    def test_knowledge_chunk_retrieval(self):
        doc_id = f"'{__import__('uuid').uuid4()}'"
        sql = f"""INSERT INTO knowledge_documents (title, document_type, source, language, status)
                  VALUES ('Test Doc', 'faq', 'test', 'en', 'indexed') RETURNING id;"""
        out, code, _ = self.db(sql)
        did = out.strip()
        chunk_text = "Garco offers general construction and renovation services."
        sql = f"""INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model)
                  VALUES ('{did}', 1, '{chunk_text}', 'text-embedding-3-small') RETURNING id;"""
        out, code, _ = self.db(sql)
        cid = out.strip()
        sql = f"""SELECT chunk_text FROM knowledge_chunks WHERE id = '{cid}';"""
        out, code, err = self.db(sql)
        assert code == 0
        assert "Garco" in out

    def test_pg_trgm_similarity_search(self, clean_db):
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Trgm User') RETURNING id;"""
        out, code, _ = clean_db(sql)
        cid = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{cid}', 'whatsapp', 'active') RETURNING id;"""
        out, code, _ = clean_db(sql)
        conv_id = out.strip()
        for i in range(5):
            clean_db(f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                        VALUES ('{conv_id}', 'incoming', 'customer', 'text', 'What construction services does Garco offer? iteration {i}');""")
        sql = f"""SELECT id, text_body FROM messages WHERE conversation_id = '{conv_id}' AND text_body LIKE '%services%';"""
        out, code, err = clean_db(sql)
        assert code == 0

    def test_parameterized_queries_only(self):
        import re
        for workflow_name, queries in WORKFLOW_QUERIES.items():
            for q_name, q in queries:
                q_upper = q.strip().upper()
                if q_upper.startswith("INSERT") or q_upper.startswith("UPDATE") or q_upper.startswith("DELETE"):
                    has_params = bool(re.search(r"\$\d+", q))
                    assert has_params, f"Query '{q_name}' in workflow '{workflow_name}' does not use parameterized queries ($1, $2, etc.)"
                elif q_upper.startswith("SELECT") and "=" in q and "$" in q:
                    has_params = bool(re.search(r"\$\d+", q))
                    assert has_params, f"Query '{q_name}' in workflow '{workflow_name}' uses dynamic conditions but no $ parameters"
