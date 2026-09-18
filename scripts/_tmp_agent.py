"""Print the AI Agent node output (incl. tool calls) from an n8n execution."""
import json
import sys


def resolve(flat, val):
    if isinstance(val, str):
        if val.isdigit() and int(val) < len(flat):
            return resolve(flat, flat[int(val)])
        return val
    if isinstance(val, dict):
        return {k: resolve(flat, v) for k, v in val.items()}
    if isinstance(val, list):
        return [resolve(flat, v) for v in val]
    return val


flat = json.load(open(sys.argv[1], encoding="utf-8-sig"))
result = resolve(flat, flat[0]["resultData"])
rd = result.get("runData") or {}
print("nodes:", list(rd.keys()))
for name in ("AI Agent", "Format Context", "Parse AI Output"):
    runs = rd.get(name)
    if not runs:
        continue
    try:
        js = runs[0]["data"]["main"][0][0]["json"]
    except (KeyError, IndexError, TypeError):
        print("\n### %s: <no main output>" % name)
        continue
    print("\n### %s ###" % name)
    if name == "AI Agent":
        print(json.dumps(js, indent=2)[:3000])
    elif name == "Parse AI Output":
        print(json.dumps(js, indent=2)[:1500])
    else:
        print(str(js.get("formattedPrompt", ""))[:1500])