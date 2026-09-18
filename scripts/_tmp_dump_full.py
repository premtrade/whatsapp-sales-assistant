"""Dump FULL node definitions (incl. options/queryReplacement/systemMessage) for a workflow."""
import json
import sys

path = sys.argv[1]
wf = json.load(open(path, encoding="utf-8"))
print(f"##### {path} | name={wf.get('name')} #####")
for n in wf.get("nodes", []):
    print(f"\n=== {n.get('name')} | {n.get('type')} | tv={n.get('typeVersion')} ===")
    print(json.dumps(n.get("parameters") or {}, indent=2, ensure_ascii=False))