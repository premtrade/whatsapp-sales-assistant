#!/usr/bin/env python3
"""
tests/integration/testContextBuilder.py - Test Workflow 03 SQL queries.
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


class TestContextBuilder:
    def test_get_contact_returns_correct_fields(self, db_connection, test_contact):
        sql = f"""SELECT id, phone, display_name, source, created_at, updated_at
                  FROM contacts WHERE id = '{test_contact['id']}';"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert len(parts) >= 6

    def test_get_conversation_returns_correct_fields(self, db_connection, test_conversation):
        sql = f"""SELECT id, contact_id, channel, status, last_message_at, created_at, updated_at
                  FROM conversations WHERE id = '{test_conversation['id']}';"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[0].strip() == test_conversation["id"]
        assert parts[1].strip() == test_conversation["contact_id"]

    def test_get_recent_messages_empty(self, db_connection, test_conversation):
        sql = f"""SELECT COALESCE(json_agg(json_build_object('direction', direction, 'sender_type', sender_type, 'text_body', text_body, 'created_at', created_at) ORDER BY created_at ASC), '[]'::json) AS messages
                  FROM (SELECT direction, sender_type, text_body, created_at FROM messages WHERE conversation_id = '{test_conversation['id']}' ORDER BY created_at DESC LIMIT 10) recent;"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "[]" in out or "direction" not in out

    def test_get_recent_messages_with_data(self, db_connection, test_conversation):
        for i in range(3):
            _psql(f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                      VALUES ('{test_conversation['id']}', 'incoming', 'customer', 'text', 'msg {i}');""")
        sql = f"""SELECT COALESCE(json_agg(json_build_object('direction', direction, 'sender_type', sender_type, 'text_body', text_body, 'created_at', created_at) ORDER BY created_at ASC), '[]'::json) AS messages
                  FROM (SELECT direction, sender_type, text_body, created_at FROM messages WHERE conversation_id = '{test_conversation['id']}' ORDER BY created_at DESC LIMIT 10) recent;"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "msg" in out

    def test_get_conversation_summary_empty(self, db_connection, test_conversation):
        sql = f"""SELECT COALESCE((SELECT summary FROM conversation_summaries WHERE conversation_id = '{test_conversation['id']}' LIMIT 1), '') AS summary,
                         COALESCE((SELECT message_count FROM conversation_summaries WHERE conversation_id = '{test_conversation['id']}' LIMIT 1), 0) AS message_count
                  FROM conversation_summaries LIMIT 1;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[0].strip() == ""
        assert parts[1].strip() == "0"

    def test_get_knowledge_chunks(self, db_connection):
        sql = """SELECT COALESCE(json_agg(json_build_object('chunk_text', chunk_text, 'metadata', metadata, 'source', kd.title) ORDER BY s DESC), '[]'::json) AS knowledge
                 FROM (SELECT kc.chunk_text, kc.metadata, kd.title AS source_title, similarity(kc.chunk_text, 'construction') AS s
                       FROM knowledge_chunks kc
                       JOIN knowledge_documents kd ON kd.id = kc.document_id
                       WHERE kd.status = 'indexed'
                       ORDER BY s DESC LIMIT 5) AS chunks;"""
        out, code, err = db_connection(sql)
        assert code == 0

    def test_get_products(self, db_connection):
        sql = """SELECT COALESCE(json_agg(json_build_object('id', id, 'sku', sku, 'name', name, 'description', description, 'price', price, 'currency', currency, 'unit', unit, 'category', category, 'product_type', product_type) ORDER BY name), '[]'::json) AS products
                 FROM products WHERE active = true;"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "GARCO" in out or "[]" in out

    def test_get_quotes_empty(self, db_connection, test_contact):
        sql = f"""SELECT COALESCE(json_agg(json_build_object('id', id, 'quote_number', quote_number, 'status', status, 'total', total, 'currency', currency, 'valid_until', valid_until) ORDER BY created_at DESC), '[]'::json) AS quotes
                  FROM quotes WHERE contact_id = '{test_contact['id']}';"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "[]" in out

    def test_get_appointments_empty(self, db_connection, test_contact):
        sql = f"""SELECT COALESCE(json_agg(json_build_object('id', id, 'title', title, 'status', status, 'starts_at', starts_at, 'ends_at', ends_at) ORDER BY starts_at DESC), '[]'::json) AS appointments
                  FROM appointments WHERE contact_id = '{test_contact['id']}';"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "[]" in out

    def test_get_handoffs_empty(self, db_connection, test_conversation):
        sql = f"""SELECT COALESCE(json_agg(json_build_object('id', id, 'status', status, 'reason', reason, 'assigned_to', assigned_to, 'created_at', created_at) ORDER BY created_at DESC), '[]'::json) AS handoffs
                  FROM handoffs WHERE conversation_id = '{test_conversation['id']}';"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "[]" in out

    def test_retrieve_customer_facts_empty(self, db_connection, test_contact):
        sql = f"""SELECT COALESCE(json_agg(json_build_object('fact_key', fact_key, 'fact_value', fact_value, 'confidence', confidence) ORDER BY confidence DESC, updated_at DESC), '[]'::json) AS facts
                  FROM customer_facts WHERE contact_id = '{test_contact['id']}';"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "[]" in out

    def test_retrieve_customer_facts_with_data(self, db_connection, test_contact):
        _psql(f"""INSERT INTO customer_facts (contact_id, fact_key, fact_value, confidence)
                  VALUES ('{test_contact['id']}', 'budget', 'JMD 50000', 0.9);""")
        sql = f"""SELECT COALESCE(json_agg(json_build_object('fact_key', fact_key, 'fact_value', fact_value, 'confidence', confidence) ORDER BY confidence DESC, updated_at DESC), '[]'::json) AS facts
                  FROM customer_facts WHERE contact_id = '{test_contact['id']}';"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "JMD 50000" in out

    def test_full_context_package_build(self, db_connection, test_contact, test_conversation):
        for i in range(3):
            _psql(f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                      VALUES ('{test_conversation['id']}', 'incoming', 'customer', 'text', 'Message {i}');""")
        _psql(f"""INSERT INTO customer_facts (contact_id, fact_key, fact_value, confidence)
                  VALUES ('{test_contact['id']}', 'service_interest', 'General Construction', 0.9);""")
        sql = f"""
        SELECT
          (SELECT json_build_object('id', id, 'phone', phone, 'name', display_name) FROM contacts WHERE id = '{test_contact['id']}') as customer,
          (SELECT COALESCE(json_agg(json_build_object('direction', direction, 'sender_type', sender_type, 'text_body', text_body, 'created_at', created_at)), '[]'::json)
           FROM messages WHERE conversation_id = '{test_conversation['id']}' ORDER BY created_at DESC LIMIT 20) as recent_messages,
          (SELECT COALESCE(json_agg(json_build_object('fact_key', fact_key, 'fact_value', fact_value, 'confidence', confidence)), '[]'::json)
           FROM customer_facts WHERE contact_id = '{test_contact['id']}') as customer_facts,
          (SELECT COALESCE(json_agg(json_build_object('id', id, 'sku', sku, 'name', name, 'price', price)), '[]'::json)
           FROM products WHERE active = true) as products;
        """
        out, code, err = db_connection(sql)
        assert code == 0
        assert "service_interest" in out or "General Construction" in out
