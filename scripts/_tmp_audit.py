"""Audit: list every Postgres node's queryReplacement + every Code node's length."""
import json
import sys

for path in sys.argv[1:]:
    wf = json.load(open(path, encoding="utf-8"))
    print(f"\n########## {wf.get('name')} ##########")
    for n in wf.get("nodes", []):
        t = n.get("type", "")
        p = n.get("parameters") or {}
        if "postgres" in t:
            qr = (p.get("options") or {}).get("queryReplacement", "")
            print(f"\n-- [PG] {n['name']}")
            print(f"   QR: {qr}")
        elif t == "n8n-nodes-base.code":
            code = p.get("jsCode", "")
            print(f"\n-- [CODE] {n['name']}  ({len(code)} chars)")
        elif "langchain" in t:
            print(f"\n-- [AI] {n['name']} ({t})")
            print(json.dumps(p, ensure_ascii=False)[:400])