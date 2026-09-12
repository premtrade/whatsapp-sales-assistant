#!/usr/bin/env python3
"""Conversation factory."""
import uuid


def make_conversation(db_connection, contact_id, **overrides):
    channel = overrides.get("channel", "whatsapp")
    status = overrides.get("status", "active")
    sql = f"""INSERT INTO conversations (contact_id, channel, status)
              VALUES ('{contact_id}', '{channel}', '{status}')
              RETURNING id, contact_id, channel, status;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_conversation failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "contact_id": parts[1].strip(),
        "channel": parts[2].strip(),
        "status": parts[3].strip(),
    }
