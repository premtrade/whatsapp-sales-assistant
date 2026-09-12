#!/usr/bin/env python3
"""
tests/integration/testMessageFlow.py - Simulate incoming WhatsApp message through database layer.
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


class TestMessageFlow:
    def test_upsert_contact_creates_new(self, db_connection):
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name, source)
                  VALUES ('{phone}', 'New Customer', 'whatsapp')
                  ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name
                  RETURNING id, phone, display_name;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == phone
        assert parts[2].strip() == "New Customer"

    def test_upsert_contact_updates_existing(self, db_connection):
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name, source)
                  VALUES ('{phone}', 'Original Name', 'whatsapp')
                  ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        cid = out.strip()
        sql = f"""INSERT INTO contacts (phone, display_name, source)
                  VALUES ('{phone}', 'Updated Name', 'whatsapp')
                  ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name
                  RETURNING display_name;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        assert out.strip() == "Updated Name"

    def test_create_conversation(self, db_connection, test_contact):
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{test_contact['id']}', 'whatsapp', 'active')
                  RETURNING id, contact_id, channel, status;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == test_contact["id"]
        assert parts[2].strip() == "whatsapp"
        assert parts[3].strip() == "active"

    def test_insert_incoming_message(self, db_connection, test_conversation):
        wa_id = f"test-wa-{uuid.uuid4().hex[:12]}"
        text = "What services does Garco offer?"
        sql = f"""INSERT INTO messages (conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body)
                  VALUES ('{test_conversation['id']}', '{wa_id}', 'incoming', 'customer', 'text', '{text}')
                  RETURNING id, direction, sender_type, text_body;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == "incoming"
        assert parts[2].strip() == "customer"
        assert parts[3].strip() == text

    def test_insert_outgoing_message(self, db_connection, test_conversation):
        sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                  VALUES ('{test_conversation['id']}', 'outgoing', 'ai', 'text', 'AI response here')
                  RETURNING id, direction, sender_type;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == "outgoing"
        assert parts[2].strip() == "ai"

    def test_message_deduplication(self, db_connection, test_conversation):
        wa_id = f"dup-test-{uuid.uuid4().hex[:12]}"
        sql1 = f"""INSERT INTO messages (conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body)
                   VALUES ('{test_conversation['id']}', '{wa_id}', 'incoming', 'customer', 'text', 'First')
                   RETURNING id;"""
        out1, code1, _ = db_connection(sql1)
        assert code1 == 0
        sql2 = f"""INSERT INTO messages (conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body)
                   VALUES ('{test_conversation['id']}', '{wa_id}', 'incoming', 'customer', 'text', 'Duplicate')
                   ON CONFLICT (whatsapp_message_id) DO NOTHING
                   RETURNING id;"""
        out2, code2, _ = db_connection(sql2)
        assert code2 == 0
        assert out2.strip() == ""

    def test_update_conversation_last_message(self, db_connection, test_conversation):
        sql = f"""UPDATE conversations SET last_message_at = NOW(), updated_at = NOW()
                  WHERE id = '{test_conversation['id']}' RETURNING id, status;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[0].strip() == test_conversation["id"]

    def test_full_message_flow_sequence(self, db_connection):
        phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
        sql = f"""INSERT INTO contacts (phone, display_name, source)
                  VALUES ('{phone}', 'Flow Test', 'whatsapp')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{contact_id}', 'whatsapp', 'active')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        conv_id = out.strip()
        wa_id = f"flow-{uuid.uuid4().hex[:12]}"
        sql = f"""INSERT INTO messages (conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body)
                  VALUES ('{conv_id}', '{wa_id}', 'incoming', 'customer', 'text', 'Hello, I need a quote')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        msg_id = out.strip()
        sql = f"""INSERT INTO audit_logs (entity_type, entity_id, action, performed_by_type, description, new_values, metadata)
                  VALUES ('conversation', '{conv_id}', 'message_received', 'system', 'Incoming WhatsApp message received', '{{}}'::jsonb, '{{"source":"whatsapp"}}'::jsonb)
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = f"""SELECT COUNT(*) FROM messages WHERE conversation_id = '{conv_id}';"""
        out, code, _ = db_connection(sql)
        assert out.strip() == "1"
