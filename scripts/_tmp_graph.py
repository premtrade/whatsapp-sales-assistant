"""List nodes + connections + tool wiring for a workflow."""
import json
import sys

path = sys.argv[1]
wf = json.load(open(path, encoding="utf-8"))
print("### nodes ###")
for n in wf["nodes"]:
    print(f"  {n.get('name'):<40} | {n.get('type')}")
print("\n### connections ###")
for src, spec in wf.get("connections", {}).items():
    for ctype, branches in spec.items():
        for i, branch in enumerate(branches):
            for c in (branch or []):
                print(f"  {src}  --[{ctype}:{i}]-->  {c['node']}")
