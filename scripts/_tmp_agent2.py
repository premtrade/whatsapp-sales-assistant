"""Print AI Agent / Parse AI Output / tool node outputs from an n8n execution."""
import json
import sys

MAX_DEPTH = 40


def resolve(flat, val, depth=0):
    if depth > MAX_DEPTH:
        return val
    if isinstance(val, str):
        if val.isdigit() and int(val) < len(flat):
            return resolve(flat, flat[int(val)], depth + 1)
        return val
    if isinstance(val, dict):
        return {k: resolve(flat, v, depth + 1) for k, v in val.items()}
    if isinstance(val, list):
        return [resolve(flat, v, depth + 1) for v in val]
    return val


flat = json.load(open(sys.argv[1], encoding="utf-8-sig"))
result = resolve(flat, flat[0]["resultData"])
rd = result.get("runData") or {}
print("nodes run:", list(rd.keys()))

WANT = ("AI Agent", "Parse AI Output", "Format Context", "Call '05", "Call '06", "Call '07",
        "Insert AI Message", "WAHA Send Message")

for name, runs in rd.items():
    if not any(w in name for w in WANT):
        continue
    for i, run in enumerate(runs):
        try:
            js = run["data"]["main"][0][0]["json"]
        except (KeyError, IndexError, TypeError):
            continue
        print(f"\n================ {name} (run {i}) ================")
        if name == "Format Context":
            print(str(js.get("formattedPrompt"))[:1800])
        elif name == "AI Agent":
            print(json.dumps(js, indent=2)[:4000])
        else:
            print(json.dumps(js, indent=2)[:1200])