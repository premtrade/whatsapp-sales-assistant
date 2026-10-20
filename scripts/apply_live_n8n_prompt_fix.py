#!/usr/bin/env python3
"""
apply_live_n8n_prompt_fix.py - push the AI prompt fix into the LIVE n8n database.

It copies ONLY the patched node definitions from the repo workflow exports into
the live n8n Postgres database, in BOTH copies n8n 2.x keeps:

    workflow_entity.nodes   -> draft copy (what the n8n editor shows)
    workflow_history.nodes  -> executable copy that an active workflow runs

Everything else in the live workflows (credentials, connections, other nodes)
is left untouched, so this is safe to run on a live instance.

Usage (on the server, repo root):
    python3 scripts/apply_live_n8n_prompt_fix.py workflows/live
    docker compose restart n8n
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _n8n_db import run_sql  # noqa: E402

NODES_BY_WORKFLOW = {
    "Workflow 2 - AI Brain": ["Format Context", "AI Agent", "Parse AI Output"],
    "03 - Memory & Context Builder": ["Build Context Package"],
}


def dollar_quote(s: str) -> str:
    tag = "n8fix"
    assert ("$" + tag + "$") not in s
    return "$" + tag + "$" + s + "$" + tag + "$"


def patch_workflow(name: str, nodes: list) -> str:
    """Return SQL that replaces the given node parameters in both copies."""
    by_name = {n.get("name"): n for n in nodes}
    sql = []
    for node_name in NODES_BY_WORKFLOW[name]:
        node = by_name[node_name]
        params = json.dumps(node.get("parameters", {}), separators=(",", ":"))
        replace = f"""(
            SELECT jsonb_agg(
                     CASE WHEN elem->>'name' = '{node_name}'
                          THEN jsonb_set(elem, '{{parameters}}', {dollar_quote(params)}::jsonb)
                          ELSE elem END)
              FROM jsonb_array_elements(nodes::jsonb) AS elem
        )"""
        sql.append(
            f"""UPDATE workflow_entity
   SET nodes = {replace},
       "updatedAt" = NOW()
 WHERE name = {dollar_quote(name)};"""
        )
        sql.append(
            f"""UPDATE workflow_history h
   SET nodes = {replace},
       "updatedAt" = NOW()
 WHERE h."workflowId" = (SELECT id FROM workflow_entity WHERE name = {dollar_quote(name)});"""
        )
    return "\n".join(sql)


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else "workflows/live"
    chunks = ["BEGIN;"]
    for wf_name, node_names in NODES_BY_WORKFLOW.items():
        fname = wf_name + ".json"
        path = os.path.join(base, fname)
        if not os.path.exists(path):
            print(f"SKIP (missing file): {path}")
            continue
        with open(path, "r", encoding="utf-8-sig") as fh:
            wf = json.load(fh)
        names = {n.get("name") for n in wf.get("nodes", [])}
        missing = [n for n in node_names if n not in names]
        if missing:
            print(f"SKIP {wf_name}: missing node(s) {missing}")
            continue
        print(f"-> {wf_name}: {', '.join(node_names)}")
        chunks.append(patch_workflow(wf_name, wf["nodes"]))
    chunks.append("COMMIT;")
    out = run_sql("\n".join(chunks))
    print(out)
    print("Done. Run `docker compose restart n8n` to reload the workflows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
