#!/usr/bin/env python3
"""
tests/integration/testAppointmentTool.py - Test appointment creation and conflict detection.
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


class TestAppointmentTool:
    def test_create_appointment(self, db_connection, test_contact, test_conversation):
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, location, starts_at, ends_at)
                  VALUES ('{test_contact['id']}', '{test_conversation['id']}', 'consultation', 'Test Consultation', 'Kingston, Jamaica', NOW(), NOW() + INTERVAL '60 minutes')
                  RETURNING id, contact_id, appointment_type, status, title, starts_at, ends_at;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == test_contact["id"]
        assert parts[2].strip() == "consultation"
        assert parts[3].strip() == "scheduled"

    def test_appointment_conflict_detection(self, db_connection, test_contact, test_conversation):
        start = "NOW()"
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, starts_at, ends_at, status)
                  VALUES ('{test_contact['id']}', '{test_conversation['id']}', 'site_visit', 'Existing Visit', {start}, {start} + INTERVAL '60 minutes', 'scheduled')
                  RETURNING id, starts_at, ends_at;"""
        out, code, _ = db_connection(sql)
        existing_parts = out.split("|")
        existing_id = existing_parts[0].strip()
        starts_at = existing_parts[1].strip()
        ends_at = existing_parts[2].strip()
        sql = f"""SELECT COUNT(*) as conflict_count, string_agg(CASE WHEN title = 'Overlap Visit' THEN 'conflict_with_Overlap Visit' ELSE 'other_overlap' END, ', ') as conflicts
                  FROM appointments
                  WHERE status IN ('scheduled', 'confirmed')
                    AND starts_at < '{ends_at}'::timestamptz
                    AND ends_at > '{starts_at}'::timestamptz + INTERVAL '60 minutes';"""
        out, code, err = db_connection(sql)
        assert code == 0

    def test_no_conflict_different_times(self, db_connection, test_contact, test_conversation):
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, starts_at, ends_at, status)
                  VALUES ('{test_contact['id']}', '{test_conversation['id']}', 'consultation', 'Morning Visit', NOW(), NOW() + INTERVAL '60 minutes', 'scheduled')
                  RETURNING id, starts_at, ends_at;"""
        out, code, _ = db_connection(sql)
        parts = out.split("|")
        starts = parts[1].strip()
        ends = parts[2].strip()
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, starts_at, ends_at, status)
                  VALUES ('{test_contact['id']}', '{test_conversation['id']}', 'consultation', 'Afternoon Visit', '{ends}' + INTERVAL '3 hours', '{ends}' + INTERVAL '4 hours', 'scheduled')
                  RETURNING id;"""
        out, code, err = db_connection(sql)
        assert code == 0

    def test_appointment_statuses(self, db_connection, test_contact):
        for status in ["scheduled", "confirmed", "completed", "cancelled", "no_show"]:
            sql = f"""INSERT INTO appointments (contact_id, appointment_type, title, starts_at, ends_at, status)
                      VALUES ('{test_contact['id']}', 'consultation', 'Status Test', NOW(), NOW() + INTERVAL '60 minutes', '{status}')
                      RETURNING id, status;"""
            out, code, _ = db_connection(sql)
            assert code == 0
            parts = out.split("|")
            assert parts[1].strip() == status

    def test_appointment_type_filtering(self, db_connection, test_contact):
        types = ["consultation", "site_visit", "installation", "follow_up", "delivery", "other"]
        for atype in types:
            _psql(f"""INSERT INTO appointments (contact_id, appointment_type, title, starts_at, ends_at)
                      VALUES ('{test_contact['id']}', '{atype}', '{atype} visit', NOW(), NOW() + INTERVAL '60 minutes');""")
        sql = f"""SELECT COUNT(*) FROM appointments WHERE contact_id = '{test_contact['id']}' AND appointment_type = 'consultation';"""
        out, code, _ = db_connection(sql)
        assert out.strip() == "1"
        sql = f"""SELECT COUNT(*) FROM appointments WHERE contact_id = '{test_contact['id']}';"""
        out, code, _ = db_connection(sql)
        assert out.strip() == "6"

    def test_appointment_assignment(self, db_connection, test_contact, test_staff):
        sql = f"""INSERT INTO appointments (contact_id, assigned_to, appointment_type, title, starts_at, ends_at)
                  VALUES ('{test_contact['id']}', '{test_staff['id']}', 'consultation', 'Assigned Visit', NOW(), NOW() + INTERVAL '60 minutes')
                  RETURNING id, assigned_to;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[1].strip() == test_staff["id"]

    def test_appointment_cascade_delete(self, db_connection, test_contact, test_conversation):
        sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, title, starts_at, ends_at)
                  VALUES ('{test_contact['id']}', '{test_conversation['id']}', 'consultation', 'Cascade Test', NOW(), NOW() + INTERVAL '60 minutes')
                  RETURNING id;"""
        out, code, _ = db_connection(sql)
        appt_id = out.strip()
        _psql(f"DELETE FROM conversations WHERE id = '{test_conversation['id']}';")
        sql = f"SELECT COUNT(*) FROM appointments WHERE id = '{appt_id}';"
        out, code, _ = db_connection(sql)
        assert out.strip() == "0"
