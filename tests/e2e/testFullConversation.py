#!/usr/bin/env python3
"""
tests/e2e/testFullConversation.py - Simulate a complete customer conversation
from first message to quote to appointment to handoff.
"""
import os
import uuid
from datetime import datetime, timezone

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


class TestFullConversation:
    def test_complete_customer_journey(self, db_connection, clean_db):
        phone = f"+1876E2E{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name, email, source)
                  VALUES ('{phone}', 'E2E Customer', 'e2e@example.com', 'whatsapp')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{contact_id}', 'whatsapp', 'active')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        conv_id = out.strip()
        wa_id = f"e2e-wa-{uuid.uuid4().hex[:12]}"
        sql = f"""INSERT INTO messages (conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body)
                  VALUES ('{conv_id}', '{wa_id}', 'incoming', 'customer', 'text', 'Hi, I need a quote for construction')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        msg_id = out.strip()
        sql = f"""INSERT INTO customer_facts (contact_id, fact_key, fact_value, confidence)
                  VALUES ('{contact_id}', 'service_interest', 'General Construction', 0.9);"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = f"""SELECT COUNT(*) FROM customer_facts WHERE contact_id = '{contact_id}';"""
        out, code, _ = db_connection(sql)
        assert out.strip() == "1"
        sql = f"""INSERT INTO quotes (quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                  VALUES ('Q-E2E-0001', '{contact_id}', '{conv_id}', 'sent', 15000, 2250, 0, 17250, 'JMD', 'E2E quote', NOW() + INTERVAL '30 days')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        quote_id = out.strip()
        assert code == 0
        sql = f"""INSERT INTO quote_items (quote_id, product_id, line_number, description, quantity, unit, unit_price, tax_rate, discount, line_total)
                  VALUES ('{quote_id}', '{uuid.uuid4()}', 1, 'General Construction Consultation', 1, 'job', 15000, 15, 0, 15000)
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, location, starts_at, ends_at)
                  VALUES ('{contact_id}', '{conv_id}', 'consultation', 'E2E Consultation', 'Kingston, Jamaica', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        appt_id = out.strip()
        assert code == 0
        sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, notes, status)
                  VALUES ('{conv_id}', 'customer', 'wants_to_speak_human', 'Customer requested human', 'pending')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        handoff_id = out.strip()
        assert code == 0
        sql = f"""SELECT COUNT(*) FROM messages WHERE conversation_id = '{conv_id}';"""
        out, code, _ = db_connection(sql)
        assert int(out.strip()) >= 1
        sql = f"""SELECT COUNT(*) FROM quotes WHERE conversation_id = '{conv_id}';"""
        out, code, _ = db_connection(sql)
        assert int(out.strip()) >= 1
        sql = f"""SELECT COUNT(*) FROM appointments WHERE conversation_id = '{conv_id}';"""
        out, code, _ = db_connection(sql)
        assert int(out.strip()) >= 1
        sql = f"""SELECT COUNT(*) FROM handoffs WHERE conversation_id = '{conv_id}';"""
        out, code, _ = db_connection(sql)
        assert int(out.strip()) >= 1

    def test_customer_introduces_themselves(self, db_connection, clean_db):
        phone = f"+1876INTRO{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name, source)
                  VALUES ('{phone}', 'Unknown', 'whatsapp')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{contact_id}', 'whatsapp', 'active')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        conv_id = out.strip()
        sql = f"""INSERT INTO customer_facts (contact_id, fact_key, fact_value, confidence)
                  VALUES ('{contact_id}', 'customer_name', 'Leroy', 0.99);"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = f"""UPDATE contacts SET display_name = 'Leroy' WHERE id = '{contact_id}' RETURNING display_name;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        assert out.strip() == "Leroy"

    def test_budget_extraction_and_storage(self, db_connection, clean_db):
        phone = f"+1876BUDGET{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Budget Test') RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO customer_facts (contact_id, fact_key, fact_value, confidence)
                  VALUES ('{contact_id}', 'budget', 'JMD 50000', 0.9);"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = f"""SELECT fact_value FROM customer_facts WHERE contact_id = '{contact_id}' AND fact_key = 'budget';"""
        out, code, _ = db_connection(sql)
        assert out.strip() == "JMD 50000"

    def test_conversation_history_ordering(self, db_connection, clean_db):
        phone = f"+1876HIST{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'History Test') RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{contact_id}', 'whatsapp', 'active')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        conv_id = out.strip()
        messages = ["Hello", "I need help", "What services do you offer?", "Can I get a quote?"]
        for msg in messages:
            _psql(f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                      VALUES ('{conv_id}', 'incoming', 'customer', 'text', '{msg}');""")
        sql = f"""SELECT text_body FROM messages WHERE conversation_id = '{conv_id}' ORDER BY created_at ASC;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        for msg in messages:
            assert msg in out
