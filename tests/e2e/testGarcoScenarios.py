#!/usr/bin/env python3
"""
tests/e2e/testGarcoScenarios.py - Test specific Garco business scenarios.
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


class TestGarcoScenarios:
    def test_customer_asks_about_services(self, db_connection, clean_db):
        phone = f"+1876SRV{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Services Inquiry') RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{contact_id}', 'whatsapp', 'active')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        conv_id = out.strip()
        sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                  VALUES ('{conv_id}', 'incoming', 'customer', 'text', 'What services does Garco offer?')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = """SELECT chunk_text FROM knowledge_chunks
                 WHERE chunk_text ILIKE '%construction%'
                    OR chunk_text ILIKE '%renovation%'
                    OR chunk_text ILIKE '%roofing%'
                 LIMIT 5;"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "construction" in out.lower() or "renovation" in out.lower()

    def test_customer_asks_for_quote(self, db_connection, clean_db):
        phone = f"+1876QUOTE{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Quote Inquiry') RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{contact_id}', 'whatsapp', 'active')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        conv_id = out.strip()
        sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                  VALUES ('{conv_id}', 'incoming', 'customer', 'text', 'Can I get a quote for roofing?')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = """SELECT sku, name, price, currency FROM products
                 WHERE active = true
                   AND (name ILIKE '%Construction%' OR sku ILIKE '%GARCO%')
                 LIMIT 1;"""
        out, code, err = db_connection(sql)
        assert code == 0
        sql = f"""INSERT INTO quotes (quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                  VALUES ('Q-GARCO-0001', '{contact_id}', '{conv_id}', 'sent', 15000, 2250, 0, 17250, 'JMD', 'Roofing quote', NOW() + INTERVAL '30 days')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0

    def test_customer_requests_human(self, db_connection, clean_db):
        phone = f"+1876HUMAN{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Handoff Request') RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{contact_id}', 'whatsapp', 'active')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        conv_id = out.strip()
        sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                  VALUES ('{conv_id}', 'incoming', 'customer', 'text', 'Can I speak to someone?')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, notes, status)
                  VALUES ('{conv_id}', 'ai', 'customer_requested_human', 'Customer asked for human', 'pending')
                  RETURNING id, status;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == "pending"
        sql = f"""UPDATE conversations SET status = 'waiting_agent' WHERE id = '{conv_id}' RETURNING status;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        assert out.strip() == "waiting_agent"

    def test_customer_provides_budget(self, db_connection, clean_db):
        phone = f"+1876BUD{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Budget Test') RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        budgets = ["JMD 50000", "JMD 100,000", "under JMD 200000", "$5000 USD"]
        for budget in budgets:
            sql = f"""INSERT INTO customer_facts (contact_id, fact_key, fact_value, confidence)
                      VALUES ('{contact_id}', 'budget', '{budget}', 0.9);"""
            out, code, _ = db_connection(sql)
            assert code == 0
        sql = f"""SELECT fact_value FROM customer_facts WHERE contact_id = '{contact_id}' AND fact_key = 'budget';"""
        out, code, _ = db_connection(sql)
        assert code == 0
        for b in budgets:
            assert b in out

    def test_customer_asks_about_location_conflicting_addresses(self, db_connection, clean_db):
        sql = """SELECT chunk_text FROM knowledge_chunks
                 WHERE chunk_text ILIKE '%Kingston%'
                    AND (chunk_text ILIKE '%Lismore%' OR chunk_text ILIKE '%Mountain View%')
                 LIMIT 3;"""
        out, code, err = db_connection(sql)
        assert code == 0
        has_lismore = "Lismore" in out
        has_mountain = "Mountain View" in out
        assert has_lismore or has_mountain
        sql = """SELECT chunk_text, metadata FROM knowledge_chunks
                 WHERE chunk_text ILIKE '%conflicting%'
                    OR chunk_text ILIKE '%addresses%'
                 LIMIT 1;"""
        out, code, err = db_connection(sql)
        assert code == 0

    def test_service_inquiry_leads_to_appointment(self, db_connection, clean_db):
        phone = f"+1876APPT{uuid.uuid4().int % 1000000000:09d}"
        sql = f"""INSERT INTO contacts (phone, display_name) VALUES ('{phone}', 'Appt Lead') RETURNING id;"""
        out, code, _ = db_connection(sql)
        contact_id = out.strip()
        sql = f"""INSERT INTO conversations (contact_id, channel, status)
                  VALUES ('{contact_id}', 'whatsapp', 'active')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        conv_id = out.strip()
        sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                  VALUES ('{conv_id}', 'incoming', 'customer', 'text', 'I need a site visit')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, starts_at, ends_at)
                  VALUES ('{contact_id}', '{conv_id}', 'site_visit', 'Site Visit', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 2 hours')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        assert code == 0
        sql = f"""SELECT COUNT(*) FROM appointments WHERE contact_id = '{contact_id}' AND conversation_id = '{conv_id}';"""
        out, code, _ = db_connection(sql)
        assert out.strip() == "1"
