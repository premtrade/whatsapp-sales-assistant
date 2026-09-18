"""Dump a node's jsCode to a readable file."""
import json
import sys

path, name = sys.argv[1], sys.argv[2]
out = sys.argv[3]
wf = json.load(open(path, encoding="utf-8"))
for n in wf["nodes"]:
    if n["name"] == name:
        code = (n.get("parameters") or {}).get("jsCode", "")
        text = code.replace("\\n", "\n").replace('\\"', '"')
        open(out, "w", encoding="utf-8").write(text)
        print("wrote", out, len(text), "chars")
        break
