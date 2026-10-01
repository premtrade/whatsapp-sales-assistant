#!/usr/bin/env python
"""Dump node definitions from the live n8n Postgres DB.

Usage:
    python scripts/dump_live_nodes.py "Workflow 2 - AI Brain"            # list node names
    python scripts/dump_live_nodes.py "Workflow 2 - AI Brain" "AI Agent" # dump one node
    python scripts/dump_live_nodes.py "Workflow 2 - AI Brain" --type n8n-nodes-base.executeWorkflow
"""
import json
import subprocess
import sys

PSQL = [
    "docker", "compose", "exec", "-T",
    "-e", "PGPASSWORD=WafloFix2026",
    "postgres", "psql", "-U", "postgres", "-d", "n8n", "-tA",
]
SQL = "SELECT nodes FROM workflow_entity WHERE name='{name}';"


def fetch(name: str) -> list:
    sql = SQL.format(name=name.replace("'", "''"))
    out = subprocess.run(PSQL + ["-c", sql], capture_output=True, text=True, check=True).stdout
    # psql -tA emits the tuple on its own line; strip shell noise/blank lines.
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("["):
            return json.loads(line)
    raise SystemExit(f"no nodes JSON found for {name!r}")


def main() -> None:
    name = sys.argv[1]
    nodes = fetch(name)
    if len(sys.argv) == 2:
        for n in nodes:
            print(f"{n['name']}\t{n['type']}")
        return
    if sys.argv[2] == "--type":
        wanted = sys.argv[3]
        selected = [n for n in nodes if n["type"] == wanted]
    else:
        selected = [n for n in nodes if n["name"] == sys.argv[2]]
    for n in selected:
        print("=" * 20, n["name"], f"({n['type']})", "=" * 20)
        print(json.dumps(n.get("parameters", {}), indent=2))
        print()


if __name__ == "__main__":
    main()
