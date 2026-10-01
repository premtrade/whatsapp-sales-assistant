#!/usr/bin/env python
"""Compare the live draft (workflow_entity.nodes) with the published version
(workflow_history row pointed at by workflow_entity."activeVersionId").

Usage: python scripts/compare_versions.py ["Workflow 2 - AI Brain" ...]
"""
import json
import subprocess
import sys

PSQL = [
    "docker", "compose", "exec", "-T",
    "-e", "PGPASSWORD=WafloFix2026",
    "postgres", "psql", "-U", "postgres", "-d", "n8n", "-tA", "-F", "\u0001",
]


def table(sql: str) -> list[list[str]]:
    out = subprocess.run(PSQL, input=sql, capture_output=True, text=True, encoding="utf-8").stdout
    rows = []
    for line in out.splitlines():
        if line.strip():
            rows.append(line.split("\u0001"))
    return rows


def main() -> None:
    names = sys.argv[1:] or [
        "Workflow 2 - AI Brain",
        "08 - AI Output Processor",
        "01 - Incoming WhatsApp Message",
    ]
    for name in names:
        q = f"""
        SELECT e.name, e."activeVersionId"::text, h."versionId"::text,
               e.nodes::text, startswith(h.nodes::text, e.nodes::text)::text
        FROM workflow_entity e
        LEFT JOIN workflow_history h ON h."versionId" = e."activeVersionId"
        WHERE e.name = '{name.replace("'", "''")}';
        """
        rows = table(q)
        if not rows:
            print(f"{name}: NOT FOUND")
            continue
        for r in rows:
            n = len(r)
            if n < 5:
                print(f"{name}: unexpected row {r[:3]}")
                continue
            live, active_ver, hist_ver, nodes_json, starts = r[0], r[1], r[2], r[3], r[4]
            live_nodes = json.loads(nodes_json) if nodes_json.startswith("[") else None
            same = "n/a"
            hist_len = "n/a"
            if active_ver and active_ver != "":
                hrows = table(
                    "SELECT nodes::text, length(nodes::text)::text FROM workflow_history "
                    f"WHERE \"versionId\" = '{active_ver}';"
                )
                if hrows:
                    hjson = hrows[0][0]
                    hist_len = hrows[0][1]
                    try:
                        hnodes = json.loads(hjson)
                        same = str(json.loads(nodes_json) == hnodes)
                    except json.JSONDecodeError:
                        same = "history-nodes-not-json"
            print(f"{live}: activeVersion={active_ver} historyVersion={hist_ver}")
            print(f"  live nodes count={len(live_nodes) if live_nodes else 'n/a'} "
                  f"live json len={len(nodes_json)} history len={hist_len}")
            print(f"  identical={same}")


if __name__ == "__main__":
    main()
