"""Dump the Appointment / Quote / Handoff tool workflows."""
import json

for path in [
    "workflows/05 - Appointment Tool.json",
    "workflows/06 - Quote Tool.json",
    "workflows/07 - Handoff Tool.json",
]:
    print(f"\n##### {path} #####")
    wf = json.load(open(path, encoding="utf-8"))
    print(f"name={wf.get('name')} id={wf.get('id')} nodes={len(wf.get('nodes',[]))} conns={len(wf.get('connections',[]))}")
    for n in wf.get("nodes", []):
        print(f"  - {n.get('id')} | {n.get('name')} | {n.get('type')} | tv={n.get('typeVersion')}")
        for k in ("code", "jsCode", "functionCode", "javascript", "pythonCode"):
            v = n.get(k)
            if v:
                print(f"    [{k}]:\n{v}")
                break
        params = n.get("parameters")
        if isinstance(params, dict):
            for k, v in params.items():
                if v and isinstance(v, str) and len(v) > 5:
                    print(f"    param[{k}]: {v}")
