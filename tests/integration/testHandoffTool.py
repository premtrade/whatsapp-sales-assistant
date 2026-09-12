#!/usr/bin/env python3
"""
tests/integration/testHandoffTool.py - Test handoff creation and assignment.
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


class TestHandoffTool:
    def test_create_handoff_defaults(self, db_connection, test_conversation):
        sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, notes, status)
                  VALUES ('{test_conversation['id']}', 'ai', 'customer_requested_human', 'Test notes', 'pending')
                  RETURNING id, conversation_id, requested_by, reason, status;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == test_conversation["id"]
        assert parts[2].strip() == "ai"
        assert parts[3].strip() == "customer_requested_human"
        assert parts[4].strip() == "pending"

    def test_create_handoff_with_assignment(self, db_connection, test_conversation, test_staff):
        sql = f"""INSERT INTO handoffs (conversation_id, assigned_to, requested_by, reason, notes, status)
                  VALUES ('{test_conversation['id']}', '{test_staff['id']}', 'customer', 'needs_human', 'Please help', 'accepted')
                  RETURNING id, assigned_to, status;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == test_staff["id"]
        assert parts[2].strip() == "accepted"

    def test_handoff_conversation_status_update(self, db_connection, test_conversation):
        sql = f"""UPDATE conversations SET status = 'waiting_agent', updated_at = NOW()
                  WHERE id = '{test_conversation['id']}' RETURNING id, status;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == "waiting_agent"

    def test_handoff_status_transitions(self, db_connection, test_conversation):
        sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, status)
                  VALUES ('{test_conversation['id']}', 'ai', 'test', 'pending')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        handoff_id = out.strip()
        for status in ["accepted", "completed", "cancelled"]:
            sql = f"""UPDATE handoffs SET status = '{status}' WHERE id = '{handoff_id}' RETURNING status;"""
            out, code, _ = db_connection(sql)
            assert code == 0
            assert out.strip() == status

    def test_multiple_handoffs_per_conversation(self, db_connection, test_conversation):
        for i in range(3):
            sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, status)
                      VALUES ('{test_conversation['id']}', 'ai', 'reason_{i}', 'pending')
                      RETURNING id;"""
            out, code, _ = db_connection(sql)
            assert code == 0
        sql = f"""SELECT COUNT(*) FROM handoffs WHERE conversation_id = '{test_conversation['id']}';"""
        out, code, _ = db_connection(sql)
        assert out.strip() == "3"

    def test_handoff_metadata(self, db_connection, test_conversation):
        metadata = '{"priority": "high", "source": "whatsapp"}'
        sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, notes, status, metadata)
                  VALUES ('{test_conversation['id']}', 'ai', 'vip_customer', 'Important customer', 'pending', '{metadata}'::jsonb)
                  RETURNING id, metadata;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert "priority" in parts[1].strip()
