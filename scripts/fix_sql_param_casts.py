#!/usr/bin/env python3
"""
fix_sql_param_casts.py - make the workflow SQL tolerant of empty parameters.

n8n Postgres nodes used to silently DROP empty query parameters, which made the
node fail with "there is no parameter $N". After the parameters are passed as
an array (see fix_postgres_query_params.py) the empty value is preserved, so
every cast has to handle it:

    $1::uuid   ->  NULLIF($1, '')::uuid
    $1::jsonb  ->  COALESCE(NULLIF($1, ''), '{}'::jsonb)

An empty uuid parameter now means "no filter" (the row is simply not found)
instead of a SQL type error.

Usage:
    python3 scripts/fix_sql_param_casts.py workflows workflows/live
"""
import argparse
import json
import os
import re
import sys

UUID_RE = re.compile(r"\$(\d+)::uuid\b")
JSONB_RE = re.compile(r"\$(\d+)::jsonb\b")


def patch_query(query: str) -> str:
    def uuid_sub(m):
        param = m.group(1)
        prefix = query[:m.start()]
        if prefix.endswith("NULLIF("):
            return m.group(0)
        return f"NULLIF(${param}, '')::uuid"

    def jsonb_sub(m):
        param = m.group(1)
        prefix = query[:m.start()]
        if prefix.endswith("NULLIF(") or prefix.endswith("COALESCE("):
            return m.group(0)
        return f"COALESCE(NULLIF(${param}, '')::jsonb, '{{}}'::jsonb)"

    # repair an earlier (incorrect) substitution: COALESCE(NULLIF($n, ''), '{}'::jsonb)
    query = re.sub(r"COALESCE\(NULLIF\((\$\d+), ''\), '\{\}'::jsonb\)",
                   r"COALESCE(NULLIF(\1, '')::jsonb, '{}'::jsonb)", query)

    query = UUID_RE.sub(uuid_sub, query)
    query = JSONB_RE.sub(jsonb_sub, query)
    return query


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dirs", nargs="+")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    total = 0
    for d in args.dirs:
        for fname in sorted(os.listdir(d)):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(d, fname)
            try:
                wf = json.load(open(path, encoding="utf-8-sig"))
            except Exception:
                continue
            if not isinstance(wf, dict) or "nodes" not in wf:
                continue
            changed = []
            for node in wf.get("nodes", []):
                par = node.get("parameters") or {}
                if node.get("type") != "n8n-nodes-base.postgres" or par.get("operation") != "executeQuery":
                    continue
                q = par.get("query", "")
                new_q = patch_query(q)
                if new_q != q:
                    par["query"] = new_q
                    node["parameters"] = par
                    changed.append(node.get("name"))
            if not changed:
                continue
            total += len(changed)
            print(f"{'would patch' if args.check else 'patched'} {path}: {', '.join(changed)}")
            if not args.check:
                json.dump(wf, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
                open(path, "a", encoding="utf-8").write("\n")
    print(f"\n{total} node(s) {'pending' if args.check else 'patched'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
