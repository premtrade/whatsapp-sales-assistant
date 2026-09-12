#!/usr/bin/env python3
"""Handoff factory."""
import uuid


def make_handoff(db_connection, conversation_id, **overrides):
    requested_by = overrides.get("requested_by", "ai")
    reason = overrides.get("reason", "customer_requested_human")
    notes = overrides.get("notes", "Test handoff")
    assigned_to = overrides.get("assigned_to")
    status = overrides.get("status", "pending")
    assigned_sql = f"'{assigned_to}'" if assigned_to else "NULL"
    sql = f"""INSERT INTO handoffs (conversation_id, assigned_to, requested_by, reason, notes, status)
              VALUES ('{conversation_id}', {assigned_sql}, '{requested_by}', '{reason}', '{notes}', '{status}')
              RETURNING id, conversation_id, requested_by, reason, status;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_handoff failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "conversation_id": parts[1].strip(),
        "requested_by": parts[2].strip(),
        "reason": parts[3].strip(),
        "status": parts[4].strip(),
    }
