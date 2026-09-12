#!/usr/bin/env python3
"""
tests/security/testInputValidation.py - Test input sanitization.
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


class TestInputValidation:
    def test_phone_number_format_validation(self, db_connection):
        valid_phones = ["+18765551234", "+12125551234", "+447700900123"]
        for phone in valid_phones:
            sql = f"""INSERT INTO contacts (phone, display_name, source)
                      VALUES ('{phone}', 'Valid Phone', 'whatsapp')
                      ON CONFLICT (phone) DO NOTHING
                      RETURNING id;"""
            out, code, err = db_connection(sql)
            assert code == 0 or "duplicate" in err.lower()

    def test_contact_display_name_max_length(self, db_connection):
        long_name = "A" * 300
        sql = f"""INSERT INTO contacts (phone, display_name, source)
                  VALUES ('+1876{uuid.uuid4().int % 10000000000:010d}', '{long_name}', 'whatsapp')
                  RETURNING id;"""
        out, code, err = db_connection(sql)
        assert code == 0

    def test_message_text_body_special_chars(self, db_connection, test_conversation):
        special_text = "Hello! @#$% & * () <script>alert('xss')</script> ' OR 1=1 -- DROP TABLE messages;"
        sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                  VALUES ('{test_conversation['id']}', 'incoming', 'customer', 'text', '{special_text}')
                  RETURNING id, text_body;"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert special_text in out

    def test_contact_status_check_constraint(self, db_connection):
        valid_statuses = ["active", "blocked", "archived"]
        for status in valid_statuses:
            phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
            sql = f"""INSERT INTO contacts (phone, display_name, source, status)
                      VALUES ('{phone}', 'Status Test', 'whatsapp', '{status}')
                      RETURNING id;"""
            out, code, err = db_connection(sql)
            assert code == 0

    def test_message_direction_check_constraint(self, db_connection, test_conversation):
        for direction in ["incoming", "outgoing"]:
            sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                      VALUES ('{test_conversation['id']}', '{direction}', 'customer', 'text', 'dir test')
                      RETURNING id;"""
            out, code, err = db_connection(sql)
            assert code == 0

    def test_message_type_check_constraint(self, db_connection, test_conversation):
        for msg_type in ["text", "image", "audio", "video", "document", "location"]:
            sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                      VALUES ('{test_conversation['id']}', 'incoming', 'customer', '{msg_type}', 'type test')
                      RETURNING id;"""
            out, code, err = db_connection(sql)
            assert code == 0

    def test_sender_type_check_constraint(self, db_connection, test_conversation):
        for sender in ["customer", "ai", "staff", "system"]:
            sql = f"""INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body)
                      VALUES ('{test_conversation['id']}', 'incoming', '{sender}', 'text', 'sender test')
                      RETURNING id;"""
            out, code, err = db_connection(sql)
            assert code == 0

    def test_quote_status_check_constraint(self, db_connection, test_contact):
        valid_statuses = ["draft", "sent", "accepted", "rejected", "expired", "cancelled"]
        for status in valid_statuses:
            sql = f"""INSERT INTO quotes (contact_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                      VALUES ('{test_contact['id']}', '{status}', 1000, 150, 0, 1150, 'JMD', 'Test', NOW() + INTERVAL '30 days')
                      RETURNING id;"""
            out, code, err = db_connection(sql)
            assert code == 0

    def test_appointment_type_check_constraint(self, db_connection, test_contact):
        valid_types = ["consultation", "site_visit", "installation", "follow_up", "delivery", "other"]
        for atype in valid_types:
            sql = f"""INSERT INTO appointments (contact_id, appointment_type, title, starts_at, ends_at)
                      VALUES ('{test_contact['id']}', '{atype}', 'Type Test', NOW(), NOW() + INTERVAL '60 minutes')
                      RETURNING id;"""
            out, code, err = db_connection(sql)
            assert code == 0

    def test_handoff_status_check_constraint(self, db_connection, test_conversation):
        valid_statuses = ["pending", "accepted", "completed", "cancelled"]
        for status in valid_statuses:
            sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, status)
                      VALUES ('{test_conversation['id']}', 'ai', 'test', '{status}')
                      RETURNING id;"""
            out, code, err = db_connection(sql)
            assert code == 0

    def test_numeric_precision_in_prices(self, db_connection, test_contact):
        sql = f"""INSERT INTO quotes (contact_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                  VALUES ('{test_contact['id']}', 'draft', 15000.50, 2250.08, 100.25, 17150.33, 'JMD', 'Precision test', NOW() + INTERVAL '30 days')
                  RETURNING subtotal, tax, discount, total;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert len(parts) == 4

    def test_email_format_stored_correctly(self, db_connection):
        emails = ["test@example.com", "user.name+tag@domain.co.uk"]
        for email in emails:
            phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
            sql = f"""INSERT INTO contacts (phone, display_name, email, source)
                      VALUES ('{phone}', 'Email Test', '{email}', 'whatsapp')
                      RETURNING email;"""
            out, code, err = db_connection(sql)
            assert code == 0
            assert email.lower() in out.lower()
