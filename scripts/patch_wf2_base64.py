#!/usr/bin/env python3
"""
patch_wf2_base64.py — Make 'Insert AI Message' comma-proof by base64-encoding
the AI reply before it reaches the Postgres node.

Root cause: n8n Postgres v2.7 splits options.queryReplacement on commas. Any AI
reply containing a comma (e.g. "...questions, but if you prefer...") is split
into extra params, shifting them so text lands in a uuid column:
  "invalid input syntax for type uuid: <reply text>"
Newline separation does NOT fix this (commas remain). base64 has no commas or
newlines, so the split is always safe; we decode inside SQL.
"""
import json
import sys

FILES = [
    "./workflows/live/Workflow 2 - AI Brain.json",
    "./workflows/Workflow 2 - AI Brain.json",
]

# 1) Parse AI Output: add reply_b64 to its output json.
OLD_PAO_RETURN = "    reply,\n    facts_extracted: cleanFacts,"
NEW_PAO_RETURN = (
    "    reply,\n"
    "    reply_b64: Buffer.from(reply, 'utf8').toString('base64'),\n"
    "    facts_extracted: cleanFacts,"
)

# 2) Insert AI Message: decode base64 in SQL, and pass reply_b64 as $2.
OLD_QUERY_TEXTCOL = "'ai', 'text', $2, '{}'::jsonb,"
NEW_QUERY_TEXTCOL = "'ai', 'text', convert_from(decode($2, 'base64'), 'UTF8'), '{}'::jsonb,"

OLD_QR = (
    "={{ String($('When Executed by Another Workflow').first().json.conversation_id || '') }}\n"
    "{{ String($('Parse AI Output').first().json.reply || '') }}\n"
    "{{ String($('When Executed by Another Workflow').first().json.business_id || '') }}"
)
NEW_QR = (
    "={{ String($('When Executed by Another Workflow').first().json.conversation_id || '') }}\n"
    "{{ String($('Parse AI Output').first().json.reply_b64 || '') }}\n"
    "{{ String($('When Executed by Another Workflow').first().json.business_id || '') }}"
)

def patch(path):
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    changed = []

    pao = next((n for n in d["nodes"] if n["name"] == "Parse AI Output"), None)
    if pao and OLD_PAO_RETURN in pao["parameters"]["jsCode"]:
        pao["parameters"]["jsCode"] = pao["parameters"]["jsCode"].replace(OLD_PAO_RETURN, NEW_PAO_RETURN)
        changed.append("Parse AI Output +reply_b64")

    iam = next((n for n in d["nodes"] if n["name"] == "Insert AI Message"), None)
    if iam:
        q = iam["parameters"]["query"]
        if OLD_QUERY_TEXTCOL in q:
            iam["parameters"]["query"] = q.replace(OLD_QUERY_TEXTCOL, NEW_QUERY_TEXTCOL)
            changed.append("Insert AI Message query decodes base64")
        qr = iam["parameters"]["options"]["queryReplacement"]
        if "$('Parse AI Output').first().json.reply " in qr or qr == OLD_QR or "json.reply " in qr:
            iam["parameters"]["options"]["queryReplacement"] = NEW_QR
            changed.append("Insert AI Message params use reply_b64")

    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(d, indent=2))
    print(f"PATCHED {path}: {changed}")

for p in FILES:
    try:
        patch(p)
    except FileNotFoundError:
        print("SKIP missing:", p)

# Validate
for p in FILES:
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        iam = next(n for n in d["nodes"] if n["name"] == "Insert AI Message")
        ok_q = "convert_from(decode($2" in iam["parameters"]["query"]
        ok_qr = "reply_b64" in iam["parameters"]["options"]["queryReplacement"]
        pao = next(n for n in d["nodes"] if n["name"] == "Parse AI Output")
        ok_pao = "reply_b64" in pao["parameters"]["jsCode"]
        print(f"OK {p.split('/')[-1]} query={ok_q} params={ok_qr} pao={ok_pao}")
    except Exception as e:
        print("FAIL", p, e)
