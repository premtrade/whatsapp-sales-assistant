#!/usr/bin/env python3
"""Message factory."""
import uuid


def make_message(db_connection, conversation_id, **overrides):
    direction = overrides.get("direction", "incoming")
    sender_type = overrides.get("sender_type", "customer")
    message_type = overrides.get("message_type", "text")
    text_body = overrides.get("text_body", f"Test message {uuid.uuid4().hex[:8]}")
    wa_id = overrides.get("whatsapp_message_id", f"test-wa-{uuid.uuid4().hex[:12]}")
    sql = f"""INSERT INTO messages (conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body)
              VALUES ('{conversation_id}', '{wa_id}', '{direction}', '{sender_type}', '{message_type}', '{text_body}')
              RETURNING id, conversation_id, direction, sender_type, text_body;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_message failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "conversation_id": parts[1].strip(),
        "direction": parts[2].strip(),
        "sender_type": parts[3].strip(),
        "text_body": parts[4].strip(),
    }
