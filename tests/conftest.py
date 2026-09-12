#!/usr/bin/env python3
"""
pytest configuration and shared fixtures.
"""
import os
import subprocess
import sys
import uuid

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _psql(sql, db="whatsapp_sales_test"):
    cmd = [
        "docker", "exec", "-i", "postgres-test", "psql",
        "-U", "postgres", "-d", db,
        "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    return result.stdout.strip(), result.returncode, result.stderr


@pytest.fixture(scope="session")
def db_connection():
    """Provide a session-scoped database connection helper."""
    return _psql


@pytest.fixture(scope="function")
def clean_db(db_connection):
    """Truncate all tables before each test for isolation, then re-seed."""
    tables = [
        "audit_logs", "handoffs", "appointments", "quote_items", "quotes",
        "messages", "conversations", "customer_facts", "conversation_summaries",
        "memory_embeddings", "knowledge_chunks", "knowledge_documents",
        "products", "contacts", "staff_users", "settings"
    ]
    for t in tables:
        db_connection(f"TRUNCATE TABLE {t} CASCADE;")
    seed_files = [
        os.path.join(REPO, "database", "schema", "017_seed_data.sql"),
        os.path.join(REPO, "database", "migrations", "024_seed_knowledge.sql"),
    ]
    for f in seed_files:
        if os.path.exists(f):
            sql = open(f, encoding="utf-8-sig").read()
            out, code, err = db_connection(sql)
            if code != 0:
                pass  # Seed may fail on re-runs due to conflicts
    yield db_connection


@pytest.fixture
def test_contact(db_connection):
    """Create a unique test contact."""
    phone = f"+1876{uuid.uuid4().int % 10000000000:010d}"
    sql = f"""INSERT INTO contacts (phone, display_name, email, company, source)
              VALUES ('{phone}', 'Test User', 'test@example.com', 'Garco', 'whatsapp')
              RETURNING id;"""
    out, code, err = db_connection(sql)
    if code != 0:
        pytest.fail(f"Failed to create contact: {err}")
    contact_id = out.strip()
    yield {"id": contact_id, "phone": phone}


@pytest.fixture
def test_conversation(db_connection, test_contact):
    """Create a test conversation linked to test_contact."""
    sql = f"""INSERT INTO conversations (contact_id, channel, status)
              VALUES ('{test_contact['id']}', 'whatsapp', 'active')
              RETURNING id;"""
    out, code, err = db_connection(sql)
    if code != 0:
        pytest.fail(f"Failed to create conversation: {err}")
    conv_id = out.strip()
    yield {"id": conv_id, "contact_id": test_contact["id"]}


@pytest.fixture
def test_staff(db_connection):
    """Create a test staff user."""
    email = f"staff-{uuid.uuid4().hex[:8]}@example.com"
    sql = f"""INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status)
              VALUES ('TEST{uuid.uuid4().int % 1000}', 'Test', 'Staff', '{email}', 'sales', 'active')
              RETURNING id;"""
    out, code, err = db_connection(sql)
    if code != 0:
        pytest.fail(f"Failed to create staff: {err}")
    yield {"id": out.strip(), "email": email}
