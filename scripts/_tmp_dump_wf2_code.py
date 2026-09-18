"""Dump ONLY the full code of the critical Workflow 2 nodes."""
import json

wf = json.load(open("workflows/Workflow 2 - AI Brain.json", encoding="utf-8"))
for n in wf.get("nodes", []):
    name = n.get("name")
    if name in ("Parse AI Output", "Format Context"):
        print(f"\n\n{'='*60}\nNODE: {name} ({n.get('id')})\n{'='*60}")
        for key in ("jsCode", "code", "functionCode", "javascript", "pythonCode"):
            val = n.get(key)
            if val:
                print(f"--- {key} ---\n{val}\n")
        # show full parameters JSON (truncated message was hiding stuff)
        print(f"\n--- full parameters ---")
        print(json.dumps(n.get("parameters") or {}, indent=2))
