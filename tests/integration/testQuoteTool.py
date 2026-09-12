#!/usr/bin/env python3
"""
tests/integration/testQuoteTool.py - Test quote creation flow.
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


class TestQuoteTool:
    def test_lookup_product_by_sku(self, db_connection):
        sql = """SELECT id, sku, name, price, currency, taxable, tax_rate
                 FROM products
                 WHERE active = true
                   AND (LOWER(sku) LIKE LOWER('%' || 'GARCO-001' || '%')
                        OR LOWER(name) LIKE LOWER('%' || 'GARCO-001' || '%'))
                 LIMIT 1;"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "GARCO-001" in out

    def test_lookup_product_by_name(self, db_connection):
        sql = """SELECT id, sku, name, price, currency
                 FROM products
                 WHERE active = true
                   AND (LOWER(sku) LIKE LOWER('%' || 'Construction' || '%')
                        OR LOWER(name) LIKE LOWER('%' || 'Construction' || '%'))
                 LIMIT 1;"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "Construction" in out

    def test_create_quote(self, db_connection, test_contact):
        sql = f"""INSERT INTO quotes (quote_number, contact_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                  VALUES ('Q-TEST-0001', '{test_contact['id']}', 'draft', 15000, 2250, 0, 17250, 'JMD', 'Test quote', NOW() + INTERVAL '30 days')
                  RETURNING id, quote_number, contact_id, status, subtotal, tax, discount, total, currency;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == "Q-TEST-0001"
        assert parts[3].strip() == "draft"
        assert parts[7].strip() == "17250"

    def test_create_quote_items(self, db_connection, test_contact):
        sql = f"""INSERT INTO quotes (contact_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                  VALUES ('{test_contact['id']}', 'draft', 15000, 2250, 0, 17250, 'JMD', 'Test', NOW() + INTERVAL '30 days')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        quote_id = out.strip()
        sql = f"""INSERT INTO quote_items (quote_id, product_id, line_number, description, quantity, unit, unit_price, tax_rate, discount, line_total)
                  VALUES ('{quote_id}', '{uuid.uuid4()}', 1, 'General Construction Consultation', 1, 'job', 15000, 15, 0, 15000)
                  RETURNING id, quote_id, description, quantity, line_total;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[2].strip() == "General Construction Consultation"
        assert parts[3].strip() == "1"

    def test_quote_total_calculation(self, db_connection, test_contact):
        subtotal = 20000
        tax_rate = 15
        discount = 1000
        tax = subtotal * (tax_rate / 100)
        total = subtotal + tax - discount
        sql = f"""INSERT INTO quotes (contact_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                  VALUES ('{test_contact['id']}', 'draft', {subtotal}, {tax}, {discount}, {total}, 'JMD', 'Calc test', NOW() + INTERVAL '30 days')
                  RETURNING subtotal, tax, discount, total;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert float(parts[0].strip()) == subtotal
        assert float(parts[3].strip()) == total

    def test_quote_status_transitions(self, db_connection, test_contact):
        sql = f"""INSERT INTO quotes (quote_id, contact_id, status) VALUES (DEFAULT, '{test_contact['id']}', 'draft') RETURNING id;"""
        out, code, err = db_connection(sql)
        assert code == 0
        qid = out.strip()
        for status in ["sent", "accepted", "expired"]:
            sql = f"""UPDATE quotes SET status = '{status}' WHERE id = '{qid}' RETURNING status;"""
            out, code, _ = db_connection(sql)
            assert code == 0
            assert out.strip() == status

    def test_quote_linked_to_conversation(self, db_connection, test_contact, test_conversation):
        sql = f"""INSERT INTO quotes (quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                  VALUES ('Q-LINK-001', '{test_contact['id']}', '{test_conversation['id']}', 'sent', 15000, 2250, 0, 17250, 'JMD', 'Linked', NOW() + INTERVAL '30 days')
                  RETURNING id, conversation_id;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == test_conversation["id"]

    def test_multiple_quotes_per_contact(self, db_connection, test_contact):
        for i in range(3):
            sql = f"""INSERT INTO quotes (contact_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
                      VALUES ('{test_contact['id']}', 'draft', {10000 * (i + 1)}, 1500, 0, {11500 * (i + 1)}, 'JMD', 'Multi {i}', NOW() + INTERVAL '30 days')
                      RETURNING id;"""
            out, code, _ = db_connection(sql)
            assert code == 0
        sql = f"""SELECT COUNT(*) FROM quotes WHERE contact_id = '{test_contact['id']}';"""
        out, code, _ = db_connection(sql)
        assert out.strip() == "3"
