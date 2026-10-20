#!/usr/bin/env python3
"""
verify_live_matches_repo.py - compare the live n8n node parameters with the
repo workflow exports so a drift between the two is visible.

Usage (on the server, repo root):
    python3 scripts/verify_live_matches_repo.py workflows/live
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _n8n_db import run_sql  # noqa: E402


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else "workflows/live"
    out = run_sql("SELECT name, nodes::text FROM workflow_entity;")
    live: dict = {}
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        try:
            live[parts[0]] = {n.get("name"): n for n in json.loads(parts[1])}
        except json.JSONDecodeError:
            continue

    drift = 0
    checked = 0
    for fname in sorted(os.listdir(base)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(base, fname), "r", encoding="utf-8-sig") as fh:
            wf = json.load(fh)
        if not isinstance(wf, dict) or "nodes" not in wf:
            continue
        name = wf.get("name") or os.path.splitext(fname)[0]
        live_nodes = live.get(name)
        if not live_nodes:
            print(f"?? {name}: not present in the live n8n instance")
            continue
        for node in wf["nodes"]:
            live_node = live_nodes.get(node.get("name"))
            if not live_node:
                print(f"?? {name} :: {node.get('name')}: node missing on live")
                drift += 1
                continue
            checked += 1
            repo_params = json.dumps(node.get("parameters", {}), sort_keys=True)
            live_params = json.dumps(live_node.get("parameters", {}), sort_keys=True)
            if repo_params != live_params:
                print(f"!! {name} :: {node.get('name')}: parameters differ from the repo export")
                drift += 1
    print(f"\nchecked {checked} node(s), {drift} difference(s)")
    return 1 if drift else 0


if __name__ == "__main__":
    sys.exit(main())
