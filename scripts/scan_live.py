#!/usr/bin/env python
"""Scan every live workflow for nodes whose parameters mention a given token.

Usage: python scripts/scan_live.py escalate
"""
import json
import subprocess
import sys

PSQL = [
    "docker", "compose", "exec", "-T",
    "-e", "PGPASSWORD=WafloFix2026",
    "postgres", "psql", "-U", "postgres", "-d", "n8n", "-tA", "-F", "\t", "-c",
]


def main() -> None:
    token = (sys.argv[1] if len(sys.argv) > 1 else "escalate").lower()
    sql = "SELECT name, json_agg(id)::text, nodes::text FROM workflow_entity GROUP BY id, name ORDER BY name;"
    out = subprocess.run(PSQL + [sql], capture_output=True, text=True, check=True).stdout
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        name, _wid, nodes_json = parts[0], parts[1], "\t".join(parts[2:])
        if not nodes_json.startswith("["):
            continue
        for n in json.loads(nodes_json):
            blob = json.dumps(n.get("parameters", {}))
            if token in blob.lower():
                print(f"{name} :: {n['name']} ({n['type']})")


if __name__ == "__main__":
    main()
