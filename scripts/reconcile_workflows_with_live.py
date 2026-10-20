#!/usr/bin/env python3
"""
reconcile_workflows_with_live.py - align the repo workflow exports with the
live n8n instance.

The repo exports are a BACKUP of the live instance, so the live instance is
the source of truth. This script copies the live node parameters into the repo
files for every node that drifted, so that a later repo -> live sync cannot
overwrite live-only fixes (that is exactly how the knowledge retrieval broke:
the repo copy of a node still referenced a child workflow by name and had no
input schema).

Usage:
    # on the server (has DB access) - writes the repo files in place
    python3 scripts/reconcile_workflows_with_live.py workflows workflows/live
    python3 scripts/reconcile_workflows_with_live.py workflows/live --node "Format Context"
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _n8n_db import run_sql  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dirs", nargs="*", default=["workflows", "workflows/live"])
    parser.add_argument("--node", action="append", help="only reconcile this node name")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

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
    for d in args.dirs:
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
                if args.node and node.get("name") not in args.node:
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
                if not args.dry_run:
                    with open(path, "w", encoding="utf-8") as fh:
                        json.dump(wf, fh, indent=2, ensure_ascii=False)
                        fh.write("\n")
    print(f"\n{changed} node(s) {'would be ' if args.dry_run else ''}reconciled")
    return 0


if __name__ == "__main__":
    sys.exit(main())
