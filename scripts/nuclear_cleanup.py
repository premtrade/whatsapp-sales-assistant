"""
nuclear_cleanup.py — Aggressively delete ALL workflows except the
active+published ones we want to keep.

Strategy:
  1. For each workflow with the name we want to keep (1 per name), un-archive
     and keep it.
  2. Delete all OTHER workflows with the same name (FK-safe order).
  3. For workflows we want to KEEP, force a fresh publish.

Run this BEFORE import_workflows.py to get to a clean state.
"""
import json, os, sys
import requests

BASE = "http://localhost:5678"
KEY = os.environ["N8N_API_KEY"]
H = {"X-N8N-API-KEY": KEY}

KEEP_NAMES = {
    "01 - Incoming WhatsApp Message",
    "03 - Memory & Context Builder",
    "04 - Memory Writer",
    "05 - Appointment Tool",
    "06 - Quote Tool",
    "Workflow 7 - Handoff Tool",
    "Workflow 2 - AI Brain",
}


def http(method, path, **kw):
    r = requests.request(method, f"{BASE}/api/v1{path}", headers=H, timeout=30, **kw)
    if r.status_code >= 400:
        print(f"  !! {method} {path} -> {r.status_code}: {r.text[:200]}")
    return r


def main():
    # List all
    r = http("GET", "/workflows?limit=200")
    all_wfs = r.json()["data"]
    print(f"Found {len(all_wfs)} workflows")

    # Categorize
    by_name = {}
    for w in all_wfs:
        by_name.setdefault(w["name"], []).append(w)

    # For each known name, keep the most recently updated and delete the rest
    for name, copies in by_name.items():
        if name not in KEEP_NAMES:
            # Delete all (cleanup any stray ones)
            for w in copies:
                print(f"  deleting non-tracked '{name}' ({w['id']})")
                http("DELETE", f"/workflows/{w['id']}")
            continue

        # Keep the most recently updated copy
        copies.sort(key=lambda w: w.get("updatedAt") or "", reverse=True)
        keep = copies[0]
        delete = copies[1:]
        print(f"\n  '{name}': keeping {keep['id']} (updated {keep.get('updatedAt')})")
        for w in delete:
            print(f"    deleting duplicate {w['id']}")
            d = http("DELETE", f"/workflows/{w['id']}")
            if d.status_code >= 400:
                # Try to archive first, then delete
                http("POST", f"/workflows/{w['id']}/archive")
                d = http("DELETE", f"/workflows/{w['id']}")
                if d.status_code >= 400:
                    print(f"    !! couldn't delete, will need manual cleanup")

    # Now make sure the kept ones are un-archived
    print("\n=== Un-archiving the kept workflows ===")
    r = http("GET", "/workflows?limit=200")
    for w in r.json()["data"]:
        if w["name"] in KEEP_NAMES and w.get("isArchived"):
            print(f"  un-archive {w['name']} ({w['id']})")
            http("POST", f"/workflows/{w['id']}/unarchive")
            http("POST", f"/workflows/{w['id']}/activate")

    print("\n=== Final state ===")
    r = http("GET", "/workflows?limit=200")
    for w in r.json()["data"]:
        print(f"  {w['name']:50s} active={w['active']} archived={w.get('isArchived')} id={w['id']}")


if __name__ == "__main__":
    main()