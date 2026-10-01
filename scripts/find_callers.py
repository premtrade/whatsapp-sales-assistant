#!/usr/bin/env python
"""Report every executeWorkflow node across all live workflows: caller -> callee.

Usage: python scripts/find_callers.py [callee workflow id or name substring]
"""
import json
import subprocess
import sys

PSQL = [
    "docker", "compose", "exec", "-T",
    "-e", "PGPASSWORD=WafloFix2026",
    "postgres", "psql", "-U", "postgres", "-d", "n8n", "-tA", "-F", "\t",
]


def run(sql: str) -> list[str]:
    out = subprocess.run(PSQL + ["-c", sql], capture_output=True, text=True, check=True).stdout
    return [line for line in out.splitlines() if line.strip()]


def main() -> None:
    needle = sys.argv[1] if len(sys.argv) > 1 else None
    rows = run("SELECT name, nodes::text FROM workflow_entity ORDER BY name;")
    for row in rows:
        if "\t" not in row:
            continue
        name, nodes_json = row.split("\t", 1)
        if not nodes_json.startswith("["):
            # multi-line JSON; skip (should not happen with -F tab + json on one line)
            continue
        try:
            nodes = json.loads(nodes_json)
        except json.JSONDecodeError:
            continue
        for n in nodes:
            if n.get("type") != "n8n-nodes-base.executeWorkflow":
                continue
            wid = n.get("parameters", {}).get("workflowId", {})
            wid = wid.get("value") if isinstance(wid, dict) else wid
            cname = n.get("parameters", {}).get("workflowId", {})
            cname = cname.get("cachedResultName") if isinstance(cname, dict) else None
            line = f"{name}\t{n['name']}\t-> {wid}\t{cname}"
            if needle is None or needle.lower() in line.lower():
                print(line)


if __name__ == "__main__":
    main()
