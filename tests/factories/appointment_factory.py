#!/usr/bin/env python3
"""Appointment factory."""
import uuid


def make_appointment(db_connection, contact_id, conversation_id=None, **overrides):
    appointment_type = overrides.get("appointment_type", "site_visit")
    status = overrides.get("status", "scheduled")
    title = overrides.get("title", "Site Visit")
    location = overrides.get("location", "Kingston, Jamaica")
    starts_at = overrides.get("starts_at", "NOW()")
    duration = overrides.get("duration_minutes", 60)
    sql = f"""INSERT INTO appointments (contact_id, conversation_id, appointment_type, status, title, location, starts_at, ends_at)
              VALUES ('{contact_id}', {'NULL' if conversation_id is None else f"'{conversation_id}'"}, '{appointment_type}', '{status}', '{title}', '{location}', {starts_at}, {starts_at} + INTERVAL '{duration} minutes')
              RETURNING id, contact_id, appointment_type, status, title, starts_at, ends_at;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_appointment failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "contact_id": parts[1].strip(),
        "appointment_type": parts[2].strip(),
        "status": parts[3].strip(),
        "title": parts[4].strip(),
        "starts_at": parts[5].strip(),
        "ends_at": parts[6].strip(),
    }
