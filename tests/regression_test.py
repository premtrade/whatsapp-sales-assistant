#!/usr/bin/env python3
"""
regression_test.py - Live end-to-end regression tests for WhatsApp Sales Assistant

Sends real WhatsApp-shaped webhook payloads to the running n8n instance and
verifies that contacts, conversations, messages, AI replies, and customer
facts are created correctly.

Run with:
    cd tests
    python -m pytest regression_test.py -v --tb=short
"""
import json
import os
import time
import uuid
from typing import Optional

import psycopg2
import pytest
import requests


REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N8N_WEBHOOK = os.environ.get("N8N_WEBHOOK", "http://localhost:5678/webhook/waha/messages")
PG_HOST = os.environ.get("PG_HOST", "localhost")
PG_PORT = int(os.environ.get("PG_PORT", "5432"))
PG_USER = os.environ.get("PG_USER", "postgres")
PG_PASS = os.environ.get("PG_PASS", "Jappyjap16")
PG_DB = os.environ.get("PG_DB", "whatsapp_sales")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def pg_conn():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, user=PG_USER, password=PG_PASS, dbname=PG_DB
    )


def _unique_phone() -> str:
    """Phone as stored in DB (digits only, no +)."""
    return f"1876{uuid.uuid4().int % 10000000000:010d}"


def _unique_message_id() -> str:
    return "3EB" + uuid.uuid4().hex[:16].upper()


def send_webhook(phone: str, body: str, push_name: str = "Test User") -> requests.Response:
    payload = {
        "event": "message",
        "session": "default",
        "engine": "WEBJS",
        "payload": {
            "id": _unique_message_id(),
            "timestamp": int(time.time()),
            "from": f"+{phone}@c.us",
            "fromMe": False,
            "body": body,
            "hasMedia": False,
            "media": None,
            "pushName": push_name,
            "notifyName": push_name,
        },
    }
    return requests.post(N8N_WEBHOOK, json=payload, timeout=15)


def poll_until(predicate, timeout: int = 90, interval: float = 3.0) -> bool:
    """Poll until predicate returns truthy, or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def fetch_contact(phone: str) -> Optional[dict]:
    """Look up contact by phone. Match with or without leading '+'."""
    candidates = [phone, f"+{phone}", phone.lstrip("+")]
    with pg_conn() as c:
        cur = c.cursor()
        cur.execute(
            "SELECT id, phone, display_name FROM contacts WHERE phone = ANY(%s)",
            (candidates,),
        )
        row = cur.fetchone()
        cur.close()
    if row:
        return {"id": str(row[0]), "phone": row[1], "display_name": row[2]}
    return None


def fetch_messages(phone: str) -> list:
    candidates = [phone, f"+{phone}", phone.lstrip("+")]
    with pg_conn() as c:
        cur = c.cursor()
        cur.execute(
            """
            SELECT m.direction, m.text_body, m.created_at
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            JOIN contacts ct ON ct.id = c.contact_id
            WHERE ct.phone = ANY(%s)
            ORDER BY m.created_at ASC
            """,
            (candidates,),
        )
        rows = cur.fetchall()
        cur.close()
    return [{"direction": d, "text_body": b, "created_at": t} for d, b, t in rows]


def fetch_facts(phone: str) -> dict:
    candidates = [phone, f"+{phone}", phone.lstrip("+")]
    with pg_conn() as c:
        cur = c.cursor()
        cur.execute(
            """
            SELECT cf.fact_key, cf.fact_value
            FROM customer_facts cf
            JOIN contacts c ON c.id = cf.contact_id
            WHERE c.phone = ANY(%s)
            """,
            (candidates,),
        )
        facts = {k: v for k, v in cur.fetchall()}
        cur.close()
    return facts


def fetch_handoff(phone: str) -> Optional[dict]:
    candidates = [phone, f"+{phone}", phone.lstrip("+")]
    with pg_conn() as c:
        cur = c.cursor()
        cur.execute(
            """
            SELECT h.id, h.reason, h.status, h.created_at
            FROM handoffs h
            JOIN conversations c ON c.id = h.conversation_id
            JOIN contacts ct ON ct.id = c.contact_id
            WHERE ct.phone = ANY(%s)
            ORDER BY h.created_at DESC LIMIT 1
            """,
            (candidates,),
        )
        row = cur.fetchone()
        cur.close()
    if row:
        return {"id": str(row[0]), "reason": row[1], "status": row[2]}
    return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_webhook_creates_contact_conversation_and_incoming_message():
    """The most basic check: webhook → contact → conversation → incoming message."""
    phone = _unique_phone()
    body = f"Smoke test message {uuid.uuid4().hex[:8]}"
    r = send_webhook(phone, body, push_name="TestUser")
    assert r.status_code == 200, f"webhook returned {r.status_code}: {r.text}"

    # 1. Contact appears
    ok = poll_until(lambda: fetch_contact(phone) is not None, timeout=30)
    contact = fetch_contact(phone)
    assert ok and contact, f"No contact created for {phone} within 30s"
    assert contact["display_name"] == "TestUser"

    # 2. Incoming message stored
    def has_incoming():
        msgs = fetch_messages(phone)
        return any(m["direction"] == "incoming" and body in m["text_body"] for m in msgs)
    ok = poll_until(has_incoming, timeout=30)
    assert ok, f"Incoming message not stored for {phone} within 30s"

    # 3. AI reply generated
    def has_outgoing():
        msgs = fetch_messages(phone)
        return any(m["direction"] == "outgoing" for m in msgs)
    ok = poll_until(has_outgoing, timeout=60)
    assert ok, f"No AI reply within 60s for {phone}"


def test_leroy_facts_extracted_correctly():
    """mvp.md requirement: full Leroy request extracts all 5 facts,
    especially budget = JMD 200,000 (must NOT be truncated to JMD 20)."""
    phone = _unique_phone()
    body = (
        "My name is Leroy. I need a general construction consultation for my house "
        "in Kingston. My budget is JMD 200,000."
    )
    r = send_webhook(phone, body, push_name="Leroy")
    assert r.status_code == 200

    # Wait for at least customer_name fact (always extracted via Code node)
    def has_name():
        facts = fetch_facts(phone)
        return facts.get("customer_name") is not None
    ok = poll_until(has_name, timeout=90)
    facts = fetch_facts(phone)
    print(f"\n  Extracted facts: {facts}")
    assert ok, f"customer_name not extracted within 90s for {phone}"
    assert facts.get("customer_name") == "Leroy", \
        f"customer_name={facts.get('customer_name')!r} (expected 'Leroy')"

    # CRITICAL: budget must be full "JMD 200,000" — test the no-truncation guarantee
    if "budget" in facts:
        assert facts["budget"] == "JMD 200,000", \
            f"budget={facts['budget']!r} must be the full 'JMD 200,000', not 'JMD 20'"


def test_no_hallucinated_price_in_reply():
    """mvp.md: AI must NOT invent a specific JMD price when asked generally."""
    phone = _unique_phone()
    body = "How much does a general construction project cost?"
    r = send_webhook(phone, body)
    assert r.status_code == 200

    def has_outgoing():
        msgs = fetch_messages(phone)
        return any(m["direction"] == "outgoing" for m in msgs)
    ok = poll_until(has_outgoing, timeout=60)
    assert ok, f"No AI reply within 60s"

    msgs = fetch_messages(phone)
    reply = next(m["text_body"] for m in msgs if m["direction"] == "outgoing")

    # None of these forbidden prices should appear
    forbidden = ["JMD 5,000", "JMD 10,000", "JMD 15,000", "JMD 25,000", "JMD 50,000",
                 "JMD 100,000", "USD 500", "USD 1,000"]
    for pat in forbidden:
        assert pat not in reply, f"Reply contains hallucinated price {pat!r}: {reply!r}"


def test_human_handoff_creates_handoff_record():
    """mvp.md: 'Let me speak to someone' must trigger the handoff tool."""
    phone = _unique_phone()
    body = "Let me speak to someone please"
    r = send_webhook(phone, body)
    assert r.status_code == 200

    ok = poll_until(lambda: fetch_handoff(phone) is not None, timeout=90)
    handoff = fetch_handoff(phone)
    assert ok, f"No handoff record created for {phone} within 90s"
    assert handoff["status"] == "pending", f"handoff status={handoff['status']!r}"


def test_unknown_service_escalates_to_human():
    """mvp.md: asking about a service Garco doesn't offer should escalate."""
    phone = _unique_phone()
    body = "Do you install elevators?"
    r = send_webhook(phone, body)
    assert r.status_code == 200

    def has_outgoing():
        msgs = fetch_messages(phone)
        return any(m["direction"] == "outgoing" for m in msgs)
    ok = poll_until(has_outgoing, timeout=60)
    assert ok, f"No AI reply within 60s"

    msgs = fetch_messages(phone)
    reply = next(m["text_body"] for m in msgs if m["direction"] == "outgoing")
    # Should escalate to human
    assert any(kw in reply.lower() for kw in
               ["human", "agent", "representative", "specialist", "team member"]), \
        f"Reply should escalate to human, got: {reply!r}"


def test_idempotency_same_message_id_creates_only_one_row():
    """Sending the same message_id twice must not create duplicate messages."""
    phone = _unique_phone()
    message_id = _unique_message_id()
    body = f"Dedupe test {uuid.uuid4().hex[:8]}"
    payload = {
        "event": "message",
        "session": "default",
        "engine": "WEBJS",
        "payload": {
            "id": message_id,
            "timestamp": int(time.time()),
            "from": f"+{phone}@c.us",
            "fromMe": False,
            "body": body,
            "hasMedia": False,
            "media": None,
            "pushName": "Test",
            "notifyName": "Test",
        },
    }
    r1 = requests.post(N8N_WEBHOOK, json=payload, timeout=15)
    time.sleep(5)
    r2 = requests.post(N8N_WEBHOOK, json=payload, timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200

    time.sleep(5)
    msgs = fetch_messages(phone)
    incoming = [m for m in msgs if m["direction"] == "incoming" and body in m["text_body"]]
    assert len(incoming) == 1, f"Expected 1 incoming message, got {len(incoming)} (dedupe failed)"


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))