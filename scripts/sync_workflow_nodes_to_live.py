#!/usr/bin/env python3
"""
sync_workflow_nodes_to_live.py - copy node parameters from the repo workflow
exports into the LIVE n8n database (both the draft copy in `workflow_entity`
and the executable copies in `workflow_history`).

Only the node types/names you pass are touched, so live-only settings
(credentials, connections, other nodes) stay untouched.

Usage (on the server, repo root):
    python3 scripts/sync_workflow_nodes_to_live.py workflows/live --node-type postgres
    python3 scripts/sync_workflow_nodes_to_live.py workflows/live --node "Format Context"
    docker compose restart n8n
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _n8n_db import run_sql  # noqa: E402


def dollar_quote(s: str) -> str:
    tag = "n8fix"
    assert ("$" + tag + "$") not in s
    return "$" + tag + "$" + s + "$" + tag + "$"


def update_statements(wf_name: str, node_name: str, params: str) -> str:
    params_lit = dollar_quote(params)
    nodes_expr = f"""(
           SELECT jsonb_agg(
                    CASE WHEN elem->>'name' = '{node_name}'
                         THEN jsonb_set(elem, '{{parameters}}', {params_lit}::jsonb)
                         ELSE elem END)
             FROM jsonb_array_elements(nodes::jsonb) AS elem
       )"""
    return (
        f"""UPDATE workflow_entity
   SET nodes = {nodes_expr},
       "updatedAt" = NOW()
 WHERE name = {dollar_quote(wf_name)};"""
        f"""
UPDATE workflow_history h
   SET nodes = {nodes_expr},
       "updatedAt" = NOW()
 WHERE h."workflowId" = (SELECT id FROM workflow_entity WHERE name = {dollar_quote(wf_name)});"""
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base", help="workflow directory (e.g. workflows/live)")
    parser.add_argument("--node-type", action="append", help="only sync nodes of this type")
    parser.add_argument("--node", action="append", help="only sync this node name")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.node_type and not args.node:
        print("ERROR: pass --node-type and/or --node")
        return 1

    sql = ["BEGIN;"]
    count = 0
    for fname in sorted(os.listdir(args.base)):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(args.base, fname)
        with open(path, "r", encoding="utf-8-sig") as fh:
            wf = json.load(fh)
        if not isinstance(wf, dict) or "nodes" not in wf:
            continue
        wf_name = wf.get("name") or os.path.splitext(fname)[0]
        for node in wf.get("nodes", []):
            ntype = node.get("type", "")
            nname = node.get("name", "")
            if args.node_type and ntype not in args.node_type:
                continue
            if args.node and nname not in args.node:
                continue
            params = json.dumps(node.get("parameters", {}), separators=(",", ":"))
            sql.append(update_statements(wf_name, nname, params))
            count += 1
            print(f"-> {wf_name} :: {nname}")
    sql.append("COMMIT;")
    if args.dry_run:
        print(f"\n(dry run) {count} node(s) would be synced")
        return 0
    out = run_sql("\n".join(sql))
    print(out)
    print(f"Synced {count} node(s). Run `docker compose restart n8n` to reload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
