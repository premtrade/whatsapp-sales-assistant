"""Write a node's jsCode parameter to a readable .js file."""
import json
import sys

path, name, out = sys.argv[1], sys.argv[2], sys.argv[3]
wf = json.load(open(path, encoding="utf-8"))
for n in wf["nodes"]:
    if n.get("name") == name:
        code = (n.get("parameters") or {}).get("jsCode", "")
        with open(out, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"wrote {len(code)} chars to {out}")
        break
else:
    print("NOT FOUND:", name)
