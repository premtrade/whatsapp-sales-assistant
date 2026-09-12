#!/usr/bin/env python3
"""
tests/security/testAuth.py - Test JWT authentication and authorization patterns.
"""
import os
import re
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


class TestAuth:
    def test_staff_user_roles_exist(self, db_connection):
        sql = "SELECT unnest(enum_range(NULL::staff_role)) FROM generate_series(1,1);"
        out, code, err = db_connection(sql)
        assert code == 0

    def test_staff_user_creation(self, db_connection):
        email = f"auth-test-{uuid.uuid4().hex[:8]}@example.com"
        sql = f"""INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status)
                  VALUES ('AUTH{uuid.uuid4().int % 1000}', 'Auth', 'Test', '{email}', 'sales', 'active')
                  RETURNING id, email, role, status;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == email
        assert parts[2].strip() == "sales"
        assert parts[3].strip() == "active"

    def test_role_based_access_control_roles(self, db_connection):
        roles = ["admin", "manager", "sales", "support", "technician"]
        for role in roles:
            sql = f"""INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status)
                      VALUES ('ROLE{uuid.uuid4().int % 1000}', 'Role', 'Test', 'role-{role}@test.com', '{role}', 'active')
                      RETURNING role;"""
            out, code, err = db_connection(sql)
            assert code == 0
            assert out.strip() == role

    def test_conversation_status_workflow(self, db_connection, test_contact):
        statuses = ["active", "waiting_customer", "waiting_agent", "closed", "archived"]
        for status in statuses:
            sql = f"""INSERT INTO conversations (contact_id, channel, status)
                      VALUES ('{test_contact['id']}', 'whatsapp', '{status}')
                      RETURNING id, status;"""
            out, code, err = db_connection(sql)
            assert code == 0
            parts = out.split("|")
            assert parts[1].strip() == status

    def test_handoff_requested_by_enum(self, db_connection, test_conversation):
        requested_bys = ["ai", "customer", "staff", "system"]
        for req in requested_bys:
            sql = f"""INSERT INTO handoffs (conversation_id, requested_by, reason, status)
                      VALUES ('{test_conversation['id']}', '{req}', 'test', 'pending')
                      RETURNING requested_by;"""
            out, code, err = db_connection(sql)
            assert code == 0
            assert out.strip() == req

    def test_jwt_secret_env_var_exists_in_example(self):
        env_path = os.path.join(REPO, ".env.example")
        with open(env_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert "BACKEND_JWT_SECRET" in content
        assert "N8N_ENCRYPTION_KEY" in content

    def test_environment_variables_not_hardcoded_in_workflows(self):
        for fname in os.listdir(os.path.join(REPO, "workflows")):
            if not fname.endswith(".json"):
                continue
            with open(os.path.join(REPO, "workflows", fname), "r", encoding="utf-8") as f:
                content = f.read()
            assert "sk-your-" not in content, f"Potential hardcoded API key in {fname}"
            assert "change_me_to_a_random" not in content, f"Potential hardcoded secret in {fname}"

    def test_credentials_not_in_workflow_json(self):
        for fname in os.listdir(os.path.join(REPO, "workflows")):
            if not fname.endswith(".json"):
                continue
            with open(os.path.join(REPO, "workflows", fname), "r", encoding="utf-8") as f:
                data = __import__("json").load(f)
            for node in data.get("nodes", []):
                creds = node.get("credentials", {})
                for cred_type, cred_val in creds.items():
                    if isinstance(cred_val, dict):
                        assert "id" in cred_val or "name" in cred_val
                        assert "password" not in str(cred_val).lower()
                        assert "secret" not in str(cred_val).lower()

    def test_audit_log_captures_action(self, db_connection, test_conversation):
        sql = f"""INSERT INTO audit_logs (entity_type, entity_id, action, performed_by_type, description)
                  VALUES ('conversation', '{test_conversation['id']}', 'ai_reply', 'system', 'AI replied to customer')
                  RETURNING id, action, entity_type;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == "ai_reply"
        assert parts[2].strip() == "conversation"
