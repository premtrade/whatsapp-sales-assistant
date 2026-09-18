"""Dump key Workflow 2 nodes (AI output parser + Appointment/Quote tool SQL) 
and Workflow 03 retrieval nodes, plus live DB column info."""
import json

def dump_nodes(path, types_of_interest):
    print(f"\n\n############ {path} ############")
    wf = json.load(open(path, encoding="utf-8"))
    print(f"Workflow name: {wf.get('name')} | id: {wf.get('id')}")
    print(f"Nodes: {len(wf.get('nodes',[]))} | Connections: {len(wf.get('connections',[]))}")
    for n in wf.get("nodes", []):
        print(f"\n=== {n.get('id')} | {n.get('name')} | {n.get('type')} | {n.get('typeVersion')} ===")
        for key in ("code", "functionCode", "jsCode", "pythonCode", "javascript"):
            if n.get(key):
                print(f"[{key}]:\n{n[key]}")
                break
        # Show expression fields / parameters for AI output parser
        params = n.get("parameters") or {}
        if isinstance(params, dict):
            for k, v in params.items():
                if v and isinstance(v, str) and len(v) > 5:
                    print(f"param[{k}]: {v[:400]}")

dump_nodes("workflows/Workflow 2 - AI Brain.json", ["code","functionCode","jsCode"])
