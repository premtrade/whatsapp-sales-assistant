#!/usr/bin/env python3
"""
fix_postgres_query_params.py - make n8n Postgres nodes immune to dropped
query parameters.

Problem
-------
The n8n Postgres node (typeVersion >= 2.5) evaluates every `{{ ... }}`
expression in `options.queryReplacement` separately. A value that evaluates to
an EMPTY STRING is silently dropped, which shifts every following parameter by
one and makes the node fail with:

    there is no parameter $6

In production this killed real customer messages: `Upsert Contact` passes
`wa_lid`, which is empty for every message that arrives on a normal @c.us
number (only WhatsApp's new @lid addressing populates it), so those messages
were dropped before the AI ever saw them.

Fix
---
Replace the comma separated expression list with ONE expression that evaluates
to an ARRAY. n8n pushes every array item into the parameter list (it only
skips `undefined`), so empty strings are preserved and stay aligned with the
SQL placeholders. No SQL change is required: the queries already use
`NULLIF($n, '')` to turn empty values into NULL.

    before: ={{ $json.a }}, {{ $json.b }}, {{ $json.c }}
    after : ={{ [String(($json.a) ?? ''), String(($json.b) ?? ''), String(($json.c) ?? '')] }}

Usage:
    python3 scripts/fix_postgres_query_params.py workflows workflows/live
    python3 scripts/fix_postgres_query_params.py --check workflows/live
"""
import argparse
import json
import os
import re
import sys

EXPR_RE = re.compile(r"\{\{", re.S)


def extract_expressions(text: str):
    """Return the inner text of every {{ ... }} block (brace aware)."""
    exprs = []
    i = 0
    while True:
        start = text.find("{{", i)
        if start < 0:
            break
        depth = 0
        j = start
        while j < len(text) - 1:
            if text[j:j + 2] == "{{":
                depth += 1
                j += 2
                continue
            if text[j:j + 2] == "}}":
                depth -= 1
                j += 2
                if depth == 0:
                    break
                continue
            j += 1
        if depth != 0:
            return None
        exprs.append(text[start + 2:j - 2])
        i = j
    return exprs


def build_array_qr(exprs) -> str:
    parts = []
    for e in exprs:
        e = e.strip()
        if e.startswith("="):
            e = e[1:].strip()
        parts.append("String((" + e + ") ?? '')")
    return "={{ [" + ", ".join(parts) + "] }}"


def patch_workflow(wf: dict) -> list:
    changed = []
    for node in wf.get("nodes", []):
        params = node.get("parameters") or {}
        if node.get("type") != "n8n-nodes-base.postgres":
            continue
        if params.get("operation") != "executeQuery":
            continue
        options = params.get("options") or {}
        qr = options.get("queryReplacement")
        if not isinstance(qr, str) or not qr.strip():
            continue
        if qr.strip().startswith("={{ ["):
            continue  # already converted
        exprs = extract_expressions(qr)
        if not exprs:
            continue
        query = params.get("query", "")
        max_param = max([int(x) for x in re.findall(r"\$(\d+)", query)] or [0])
        if len(exprs) != max_param:
            print(f"  !! {node.get('name')}: {len(exprs)} expressions but {max_param} SQL placeholders - skipped")
            continue
        options["queryReplacement"] = build_array_qr(exprs)
        params["options"] = options
        node["parameters"] = params
        changed.append(node.get("name"))
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dirs", nargs="+", help="workflow directories to patch")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    total = 0
    for d in args.dirs:
        if not os.path.isdir(d):
            print(f"SKIP (not a directory): {d}")
            continue
        for fname in sorted(os.listdir(d)):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(d, fname)
            with open(path, "r", encoding="utf-8-sig") as fh:
                wf = json.load(fh)
            if not isinstance(wf, dict) or "nodes" not in wf:
                continue
            changed = patch_workflow(wf)
            if not changed:
                continue
            total += len(changed)
            print(f"{'would patch' if args.check else 'patched'} {path}: {', '.join(changed)}")
            if not args.check:
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(wf, fh, indent=2, ensure_ascii=False)
                    fh.write("\n")
    print(f"\n{total} node(s) {'pending' if args.check else 'patched'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
