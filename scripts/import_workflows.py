"""
import_workflows.py — One-shot importer for the 7 n8n workflows.

Prereqs:
  1. Enable the n8n public API and create an API key in n8n:
       Settings -> n8n API -> Create API key (Role: Owner)
  2. Set the env vars N8N_API_KEY and N8N_BASE_URL before running:
       $env:N8N_API_KEY = "n8n_api_xxx..."
       $env:N8N_BASE_URL = "http://localhost:5678"

Behaviour:
  - For each workflows/*.json file in dependency order:
      1. POST it to /api/v1/workflows (n8n creates a new workflow with a new ID).
         If a workflow with the same NAME already exists, the script first
         DELETES the old one to keep the system clean.
      2. The returned workflow has node credential references stripped (n8n's
         import endpoint does not preserve credential bindings from the JSON).
         You must re-link credentials in the UI.
      3. The script activates the new workflow so the webhook is registered.

After running, open n8n and re-link the Postgres / Groq / HuggingFace
credentials on each workflow, then save.
"""
import json
import os
import sys
import time
from pathlib import Path
import requests

BASE = os.environ.get("N8N_BASE_URL", "http://localhost:5678").rstrip("/")
API_KEY = os.environ.get("N8N_API_KEY")
HEADERS = {"X-N8N-API-KEY": API_KEY} if API_KEY else {}

WORKFLOW_ORDER = [
    "03 - Memory & Context Builder.json",
    "04 - Memory Writer.json",
    "05 - Appointment Tool.json",
    "06 - Quote Tool.json",
    "Workflow 7 - Handoff Tool.json",
    "08 - AI Output Processor.json",
    "Workflow 2 - AI Brain.json",
    "01 - Incoming WhatsApp Message.json",
    "08 - Quote Follow-up Sequences.json",
    "09 - Appointment Reminders.json",
    "10 - Abandoned Conversation Recovery.json",
]
WF_DIR = Path(__file__).parent.parent / "workflows"


def http(method, path, **kw):
    url = f"{BASE}/api/v1{path}"
    r = requests.request(method, url, headers=HEADERS, timeout=30, **kw)
    if r.status_code >= 400:
        print(f"  !! {method} {path} -> {r.status_code}: {r.text[:300]}")
        r.raise_for_status()
    return r.json() if r.text else {}


def find_existing(name: str):
    workflows = http("GET", "/workflows").get("data", [])
    return [w for w in workflows if w.get("name") == name]


def import_workflow(path: Path):
    name = path.stem  # filename without .json
    print(f"\n=== {path.name} ===")

    # Delete ALL existing copies (handles duplicates from previous runs)
    existing_list = find_existing(name)
    for existing in existing_list:
        print(f"  deleting existing '{name}' (id={existing['id']}, active={existing.get('active')})")
        try:
            http("DELETE", f"/workflows/{existing['id']}")
        except Exception as e:
            # 500 = n8n can't delete due to FK from a stale workflow. Try archiving instead.
            print(f"  !! delete failed: {e}")
            print(f"  !! attempting archive")
            try:
                http("POST", f"/workflows/{existing['id']}/archive")
            except Exception as e2:
                print(f"  !! archive also failed: {e2}")
        time.sleep(0.5)

    # Import via the public API: n8n's POST /workflows accepts the raw
    # workflow JSON (nodes, connections, settings, etc.) directly.
    with open(path, "r", encoding="utf-8") as f:
        wf_data = json.load(f)

    # Drop fixed IDs and read-only metadata so n8n accepts the import payload.
    wf_data.pop("id", None)
    wf_data.pop("versionId", None)
    wf_data.pop("active", None)
    wf_data.pop("activeVersionId", None)
    wf_data.pop("isArchived", None)
    wf_data.pop("triggerCount", None)
    wf_data.pop("shared", None)
    wf_data.pop("meta", None)
    wf_data.pop("tags", None)

    try:
        created = http("POST", "/workflows", json=wf_data)
    except Exception as e:
        print(f"  !! import failed: {e}")
        return None

    new_id = created.get("id")
    print(f"  imported as id={new_id}")
    return new_id


def publish_workflow(workflow_id: str) -> bool:
    for ep in ("publish", "activate"):
        try:
            http("POST", f"/workflows/{workflow_id}/{ep}")
            print(f"  {ep}d")
        except Exception as e:
            print(f"  !! {ep} failed: {e}")
            if ep == "publish":
                continue
            return False
    return True


def main() -> int:
    if not API_KEY:
        print("ERROR: N8N_API_KEY env var is not set. Create one in n8n (Settings -> n8n API) and set $env:N8N_API_KEY.")
        return 1

    # Verify connectivity via /workflows (the public API doesn't expose /users/me)
    try:
        resp = http("GET", "/workflows?limit=1")
        print(f"Connected to n8n at {BASE} (workflows endpoint OK)")
    except Exception as e:
        print(f"ERROR: cannot reach n8n API: {e}")
        return 1

    # Verify all 7 files exist
    for fn in WORKFLOW_ORDER:
        if not (WF_DIR / fn).exists():
            print(f"ERROR: missing {WF_DIR / fn}")
            return 1

    ok = 0
    imported_ids = {}
    for fn in WORKFLOW_ORDER:
        wid = import_workflow(WF_DIR / fn)
        if wid:
            imported_ids[fn] = wid
            ok += 1
        time.sleep(1)

    print(f"\nImported {ok}/{len(WORKFLOW_ORDER)} workflows.")
    print("Publishing/activating in dependency order...")
    published = 0
    for fn in WORKFLOW_ORDER:
        wid = imported_ids.get(fn)
        if not wid:
            continue
        if publish_workflow(wid):
            published += 1
        time.sleep(0.5)

    print(f"\nDone: {ok} imported, {published} published/activated out of {len(WORKFLOW_ORDER)}.")
    print("\nNEXT STEPS:")
    print("  1. Open n8n UI: http://localhost:5678")
    print("  2. For each imported workflow, re-link credentials:")
    print("     - Postgres: any Postgres node (only needs it once if same credential)")
    print("     - Groq: AI Agent / Groq Chat Model nodes")
    print("     - HuggingFace: Embeddings HuggingFace node in workflow 03")
    print("  3. Save each workflow. Active state was already set by the script.")
    print("  4. Run: python tests/smoke_test_workflows.py")
    return 0 if ok == len(WORKFLOW_ORDER) else 2


if __name__ == "__main__":
    sys.exit(main())