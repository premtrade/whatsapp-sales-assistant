#!/usr/bin/env python3
"""
reconcile_workflows_with_live.py - align the repo workflow exports with the
live n8n instance for the nodes that drifted (model names, payload mapping,
timeouts).

Only the node types/names in SYNCED_NODES are copied from live; the
executeWorkflow nodes keep their portable "name" references in the repo, and
every node this project patches (Format Context, Parse AI Output, Build
Context Package, the Postgres nodes) is left untouched.

Usage:
    # on the server (has DB access) - writes the repo files in place
    python3 scripts/reconcile_workflows_with_live.py workflows workflows/live
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _n8n_db import run_sql  # noqa: E402

SYNCED_NODES = {
    "Normalize Payload",
    "Groq Chat Model",
    "Schedule Trigger",
    "Generate Message Embedding",
    "Get Knowledge Chunks (semantic)",
    "Get Business by Phone",
}


def main() -> int:
    dirs = sys.argv[1:] or ["workflows", "workflows/live"]
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

    changed = 0
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for fname in sorted(os.listdir(d)):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(d, fname)
            with open(path, "r", encoding="utf-8-sig") as fh:
                wf = json.load(fh)
            if not isinstance(wf, dict) or "nodes" not in wf:
                continue
            live_nodes = live.get(wf.get("name") or "")
            if not live_nodes:
                continue
            touched = []
            for node in wf["nodes"]:
                if node.get("name") not in SYNCED_NODES:
                    continue
                live_node = live_nodes.get(node.get("name"))
                if not live_node:
                    continue
                if json.dumps(node.get("parameters", {}), sort_keys=True) != json.dumps(
                    live_node.get("parameters", {}), sort_keys=True
                ):
                    node["parameters"] = live_node.get("parameters", {})
                    touched.append(node.get("name"))
            if touched:
                changed += len(touched)
                print(f"reconciled {path}: {', '.join(touched)}")
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(wf, fh, indent=2, ensure_ascii=False)
                    fh.write("\n")
    print(f"\n{changed} node(s) reconciled")
    return 0


if __name__ == "__main__":
    sys.exit(main())
