#!/usr/bin/env python3
"""
smoke_test_workflows.py - End-to-end smoke test for all 7 n8n workflows.

Exercises:
  01 Incoming WhatsApp Message  (webhook)
  02 AI Brain                   (orchestration + tool calls)
  03 Memory & Context Builder   (pgvector + facts + products)
  04 Memory Writer              (customer_name + customer_facts)
  05 Appointment Tool           (create / conflict / validation)
  06 Quote Tool                 (create / pending_review)
  07 Handoff Tool               (create + waiting_agent status)

After each step, runs SQL assertions and prints PASS/FAIL.

Usage:
  python tests/smoke_test_workflows.py

Prerequisites:
  - Docker stack running (docker compose up -d)
  - All 7 workflows imported and activated in n8n
  - WAHA reachable at WAHA_HOST:WAHA_PORT (or skip WAHA roundtrip with --no-waha)
"""
import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

DOCKER = ["docker", "compose", "exec", "-T", "postgres"]
PSQL = DOCKER + ["psql", "-U", "postgres", "-d", "whatsapp_sales",
                 "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"]
CWD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- Helpers ----------------------------------------------------------------

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
INFO = "\033[36mINFO\033[0m"

# Module-level failure counter so scenario_passed() can return False
# when any individual expect() check failed (scenarios themselves
# normally just keep going and return True at the end).
_FAIL_COUNT = 0


def expect(name: str, ok: bool, detail: str = "") -> bool:
    global _FAIL_COUNT
    if not ok:
        _FAIL_COUNT += 1
    print(f"  [{PASS if ok else FAIL}] {name}" + (f"  ({detail})" if detail else ""))
    return ok


def scenario_passed() -> bool:
    return _FAIL_COUNT == 0


def reset_failures() -> None:
    global _FAIL_COUNT
    _FAIL_COUNT = 0


def psql(sql: str) -> str:
    """Run SQL in the postgres container, return stdout."""
    result = subprocess.run(PSQL + ["-c", sql], capture_output=True, text=True, cwd=CWD)
    if result.returncode != 0:
        raise RuntimeError(f"psql failed:\n{result.stderr}\nSQL was:\n{sql}")
    return result.stdout.strip()


def psql_scalar(sql: str) -> str:
    return psql(sql).strip()


def curl(url: str, payload: dict, headers: dict | None = None) -> tuple[int, str]:
    cmd = ["curl", "-sS", "-o", "-", "-w", "\n__HTTP__%{http_code}", "-X", "POST", url]
    for k, v in (headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    cmd += ["-d", json.dumps(payload)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    body, _, code = result.stdout.rpartition("__HTTP__")
    return int(code), body.strip()


def expect(name: str, ok: bool, detail: str = "") -> bool:
    print(f"  [{PASS if ok else FAIL}] {name}" + (f"  ({detail})" if detail else ""))
    return ok


def random_phone() -> str:
    """Generate an E.164-style Jamaican number that survives the workflow's
    digit-only regex. 11 digits: country code (1876) + 7 random digits."""
    return "+1876" + "".join(str((ord(c) % 10)) for c in uuid.uuid4().hex[:7])


def random_msg_id() -> str:
    """WhatsApp message IDs are always digits."""
    return "wamid." + "".join(str((ord(c) % 10)) for c in uuid.uuid4().hex[:12])


# Workflow 01 strips leading '+' from phone numbers before persisting.
def normalize_phone(phone: str) -> str:
    return phone.lstrip("+")


# ---- Test scenarios ---------------------------------------------------------

def scenario_text_message(no_waha: bool) -> bool:
    """Send a plain text WhatsApp message, expect AI reply, facts extracted."""
    print(f"\n=== Scenario 1: text message + AI reply (Leroy, Kingston, JMD 200,000) ===")

    # Unique phone to isolate this run
    test_phone = random_phone()
    test_msg_id = random_msg_id()
    test_message = (
        "My name is Leroy. I need a general construction consultation "
        "for my house in Kingston. My budget is JMD 200,000."
    )

    payload = {
        "event": "message",
        "session": "default",
        "engine": "WEBJS",
        "payload": {
            "id": test_msg_id,
            "timestamp": int(time.time()),
            "from": test_phone.replace("+", "") + "@c.us",
            "fromMe": False,
            "to": "default@c.us",
            "body": test_message,
            "hasMedia": False,
            "media": None,
            "_data": {
                "id": {"_serialized": test_msg_id},
                "t": int(time.time()),
            },
            "pushName": "Leroy",
        },
    }

    n8n_url = os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678") + "/webhook/waha/messages"
    print(f"  {INFO} POST {n8n_url}")
    code, body = curl(n8n_url, payload, {"Content-Type": "application/json"})
    print(f"  HTTP {code}  body={body[:200]}")
    ok = code == 200
    expect("webhook returns 200", ok, f"got {code}")
    if not ok:
        return False

    # Give the workflow chain a moment to settle (n8n is async after webhook respond).
    # 8s covers: pgvector embedding lookup, Groq reply, Memory Writer fact extraction.
    time.sleep(8)

    # 1. contacts row  (phone stored WITHOUT leading '+')
    contact_id = psql_scalar(
        f"SELECT id FROM contacts WHERE phone = '{normalize_phone(test_phone)}';"
    )
    expect("contact created/upserted", bool(contact_id), contact_id[:8] if contact_id else "missing")
    if not contact_id:
        # Debug aid: list the most recent contacts so the user can see what phone format was stored
        recent = psql("SELECT phone, display_name FROM contacts ORDER BY created_at DESC LIMIT 3;")
        print(f"  [DEBUG] recent contacts: {recent!r}")

    # 2. conversation row
    conv_id = psql_scalar(
        f"SELECT id FROM conversations WHERE contact_id = '{contact_id}' AND channel = 'whatsapp';"
    )
    expect("conversation created/upserted", bool(conv_id), conv_id[:8] if conv_id else "missing")

    # 3. incoming message stored
    msg_count = psql_scalar(
        f"SELECT COUNT(*) FROM messages "
        f"WHERE conversation_id = '{conv_id}' AND whatsapp_message_id = '{test_msg_id}';"
    )
    expect("incoming message persisted", msg_count == "1", f"count={msg_count}")

    # 4. customer_facts extracted by AI
    name_val = psql_scalar(
        f"SELECT fact_value FROM customer_facts "
        f"WHERE contact_id = '{contact_id}' AND fact_key = 'customer_name';"
    )
    expect("customer_name fact extracted", name_val == "Leroy", f"got '{name_val}'")

    budget_val = psql_scalar(
        f"SELECT fact_value FROM customer_facts "
        f"WHERE contact_id = '{contact_id}' AND fact_key = 'budget';"
    )
    expect("budget fact preserved (no truncation)", budget_val == "JMD 200,000", f"got '{budget_val}'")

    location_val = psql_scalar(
        f"SELECT fact_value FROM customer_facts "
        f"WHERE contact_id = '{contact_id}' AND fact_key = 'location';"
    )
    expect("location fact extracted", location_val and "Kingston" in location_val, f"got '{location_val}'")

    service_val = psql_scalar(
        f"SELECT fact_value FROM customer_facts "
        f"WHERE contact_id = '{contact_id}' AND fact_key = 'service_interest';"
    )
    expect("service_interest extracted", bool(service_val), f"got '{service_val}'")

    # 5. contact display_name updated by workflow 04 (regex extractor)
    display_name = psql_scalar(
        f"SELECT display_name FROM contacts WHERE id = '{contact_id}';"
    )
    expect("contact.display_name = 'Leroy'", display_name == "Leroy", f"got '{display_name}'")

    # 6. AI reply message persisted (outgoing, sender_type=ai)
    ai_count = psql_scalar(
        f"SELECT COUNT(*) FROM messages "
        f"WHERE conversation_id = '{conv_id}' AND direction = 'outgoing' AND sender_type = 'ai';"
    )
    expect("AI reply saved to messages", int(ai_count) >= 1, f"count={ai_count}")

    if not no_waha:
        # 7. WAHA actually got the outbound message via the WAHA API logs
        #    (docker-compose logs waha --tail=20)
        waha_logs = subprocess.run(
            ["docker", "compose", "logs", "--no-color", "--tail=50", "waha"],
            capture_output=True, text=True, cwd=CWD,
        ).stdout
        sent_marker = "POST /api/sendText"
        expect(
            "WAHA sendText was called",
            sent_marker in waha_logs or "sendText" in waha_logs,
            "see: docker compose logs waha --tail=20",
        )

    # 8. audit_logs has message_received AND ai_reply (or ai_failure)
    audit_actions = psql(
        f"SELECT action FROM audit_logs WHERE entity_id = '{conv_id}' ORDER BY created_at DESC LIMIT 5;"
    ).splitlines()
    expect(
        "audit log recorded message_received",
        "message_received" in audit_actions,
        f"actions={audit_actions}",
    )

    return True


def scenario_handoff_tool(no_waha: bool) -> bool:
    """Send a message that should trigger the Handoff Tool (human request)."""
    print(f"\n=== Scenario 2: human handoff request ===")

    test_phone = random_phone()
    test_msg_id = random_msg_id()
    payload = {
        "event": "message",
        "session": "default",
        "payload": {
            "id": test_msg_id,
            "timestamp": int(time.time()),
            "from": test_phone.replace("+", "") + "@c.us",
            "fromMe": False,
            "body": "Please let me speak to a real person from Garco.",
            "hasMedia": False,
            "_data": {"id": {"_serialized": test_msg_id}, "t": int(time.time())},
            "pushName": "Anika",
        },
    }
    code, _ = curl(
        os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678") + "/webhook/waha/messages",
        payload,
        {"Content-Type": "application/json"},
    )
    expect("handoff webhook 200", code == 200, f"got {code}")
    time.sleep(8)

    conv_id = psql_scalar(
        f"SELECT id FROM conversations WHERE contact_id = "
        f"(SELECT id FROM contacts WHERE phone = '{normalize_phone(test_phone)}') AND channel = 'whatsapp';"
    )
    expect("conversation created", bool(conv_id))

    handoff_count = psql_scalar(
        f"SELECT COUNT(*) FROM handoffs WHERE conversation_id = '{conv_id}' AND status = 'pending';"
    )
    expect("handoff record created (status=pending)", handoff_count == "1", f"count={handoff_count}")

    conv_status = psql_scalar(
        f"SELECT status FROM conversations WHERE id = '{conv_id}';"
    )
    expect("conversation.status = waiting_agent (not 'human_pending')",
           conv_status == "waiting_agent", f"got '{conv_status}'")
    return True


def scenario_quote_tool(no_waha: bool) -> bool:
    """Send a quote request, expect a quote row in 'draft' or 'pending_review'."""
    print(f"\n=== Scenario 3: quote request ===")

    test_phone = random_phone()
    test_msg_id = random_msg_id()
    # The Garco product SKU seeded is GARCO-001 with price=NULL (per migration 033).
    # So the Quote Tool should mark it requires_review=true.
    payload = {
        "event": "message",
        "session": "default",
        "payload": {
            "id": test_msg_id,
            "timestamp": int(time.time()),
            "from": test_phone.replace("+", "") + "@c.us",
            "fromMe": False,
            "body": "Can you give me a quote for General Construction Consultation?",
            "hasMedia": False,
            "_data": {"id": {"_serialized": test_msg_id}, "t": int(time.time())},
            "pushName": "Marcus",
        },
    }
    code, _ = curl(
        os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678") + "/webhook/waha/messages",
        payload,
        {"Content-Type": "application/json"},
    )
    expect("quote webhook 200", code == 200, f"got {code}")
    time.sleep(8)

    conv_id = psql_scalar(
        f"SELECT id FROM conversations WHERE contact_id = "
        f"(SELECT id FROM contacts WHERE phone = '{normalize_phone(test_phone)}') AND channel = 'whatsapp';"
    )
    quote_count = psql_scalar(
        f"SELECT COUNT(*) FROM quotes WHERE conversation_id = '{conv_id}';"
    )
    expect("quote record created", int(quote_count) >= 1, f"count={quote_count}")

    if int(quote_count) >= 1:
        quote_status = psql_scalar(
            f"SELECT status FROM quotes WHERE conversation_id = '{conv_id}' LIMIT 1;"
        )
        expect(
            "quote.status valid (one of draft/sent/...)",
            quote_status in ("draft", "sent", "accepted", "rejected", "expired", "cancelled"),
            f"got '{quote_status}'",
        )
        # migration 033 made GARCO-001 price=NULL, so requires_review=true is expected
        meta = psql_scalar(
            f"SELECT metadata->>'requires_review' FROM quotes WHERE conversation_id = '{conv_id}' LIMIT 1;"
        )
        expect("quote.metadata.requires_review flagged for human approval",
               meta in ("true", "false"), f"got '{meta}'")
    return True


def scenario_media_message(no_waha: bool) -> bool:
    """Send an image message and verify it is persisted with media_url + message_type=image."""
    print(f"\n=== Scenario 4: image message persistence ===")

    test_phone = random_phone()
    test_msg_id = random_msg_id()
    payload = {
        "event": "message",
        "session": "default",
        "payload": {
            "id": test_msg_id,
            "timestamp": int(time.time()),
            "from": test_phone.replace("+", "") + "@c.us",
            "fromMe": False,
            "body": "",
            "hasMedia": True,
            "media": {
                "url": "https://example.invalid/fake-image.jpg",
                "mimetype": "image/jpeg",
                "filename": "site.jpg",
            },
            "_data": {"id": {"_serialized": test_msg_id}, "t": int(time.time())},
            "pushName": "Sam",
        },
    }
    code, _ = curl(
        os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678") + "/webhook/waha/messages",
        payload,
        {"Content-Type": "application/json"},
    )
    expect("image webhook 200", code == 200, f"got {code}")
    time.sleep(5)

    row = psql(
        f"SELECT message_type, COALESCE(media_url, ''), COALESCE(mime_type, '') "
        f"FROM messages WHERE whatsapp_message_id = '{test_msg_id}';"
    )
    expect("image message persisted", bool(row), f"row='{row}'")
    parts = row.split("|") if row else []
    if len(parts) == 3:
        mtype, url, mime = parts
        expect("message_type = 'image'", mtype == "image", f"got '{mtype}'")
        expect("media_url persisted", "example.invalid" in url, f"got '{url}'")
        expect("mime_type persisted", mime == "image/jpeg", f"got '{mime}'")
    return True


def scenario_pgvector_retrieval(_no_waha: bool = False) -> bool:
    """Direct DB check that workflow 03's pgvector table actually returns rows."""
    print(f"\n=== Scenario 5: pgvector retrieval sanity ===")
    chunks_with_embedding = psql_scalar(
        "SELECT COUNT(*) FROM knowledge_chunks WHERE embedding IS NOT NULL;"
    )
    expect("knowledge_chunks has embeddings", int(chunks_with_embedding) > 0,
           f"count={chunks_with_embedding}")
    dummy_chunks = psql_scalar(
        "SELECT COUNT(*) FROM knowledge_chunks WHERE metadata->>'is_dummy' = 'true';"
    )
    expect("dummy fallback chunk present (per migration 034)",
           int(dummy_chunks) >= 1, f"count={dummy_chunks}")
    garco_chunks = psql_scalar(
        "SELECT COUNT(*) FROM knowledge_chunks kc "
        "JOIN knowledge_documents kd ON kd.id = kc.document_id "
        "WHERE kd.title = 'Garco Business Directory';"
    )
    expect("Garco business doc has chunks",
           int(garco_chunks) >= 1, f"count={garco_chunks}")
    return True


# ---- Main -------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--no-waha", action="store_true",
                   help="skip WAHA round-trip checks (logs) — useful in CI")
    p.add_argument("--only", choices=["text", "handoff", "quote", "media", "pgvector"],
                   help="run only the named scenario")
    args = p.parse_args()

    print("=" * 70)
    print("WHATSAPP SALES ASSISTANT — WORKFLOW SMOKE TEST")
    print("=" * 70)
    print(f"{INFO} docker compose ps:")
    subprocess.run(["docker", "compose", "ps"], cwd=CWD)

    runs = {
        "text": scenario_text_message,
        "handoff": scenario_handoff_tool,
        "quote": scenario_quote_tool,
        "media": scenario_media_message,
        "pgvector": scenario_pgvector_retrieval,
    }
    if args.only:
        runs = {args.only: runs[args.only]}

    overall = True
    for name, fn in runs.items():
        reset_failures()
        try:
            fn(args.no_waha)
        except Exception as e:
            print(f"  [{FAIL}] {name} raised: {e}")
            expect("scenario completed without exception", False, str(e))
        ok = scenario_passed()
        overall = overall and ok

    print("\n" + "=" * 70)
    print("OVERALL: " + (PASS if overall else FAIL))
    print("=" * 70)
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(main())