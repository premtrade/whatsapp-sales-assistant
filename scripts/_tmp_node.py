"""Print a single node's full JSON from a workflow file."""
import json
import sys

path, name = sys.argv[1], sys.argv[2]
wf = json.load(open(path, encoding="utf-8"))
for n in wf.get("nodes", []):
    if n.get("name") == name:
        print(json.dumps(n, indent=2, ensure_ascii=False))
        break
else:
    print("NOT FOUND:", name)
    print("Available:", [n.get("name") for n in wf.get("nodes", [])])