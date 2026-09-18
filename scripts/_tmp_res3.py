"""Resolve selected node outputs from an n8n flattened execution JSON."""
import json
import sys


class Resolver:
    def __init__(self, flat):
        self.flat = flat

    def get(self, val, seen=None):
        seen = seen or set()
        if isinstance(val, str):
            if val.isdigit():
                i = int(val)
                if i < len(self.flat) and i not in seen:
                    return self.get(self.flat[i], seen | {i})
            return val
        if isinstance(val, dict):
            return {k: self.get(v, seen) for k, v in val.items()}
        if isinstance(val, list):
            return [self.get(v, seen) for v in val]
        return val

    def result(self):
        root = self.flat[0]
        return self.get(root["resultData"])

    def node(self, r, name):
        runs = (r.get("runData") or {}).get(name)
        if not runs:
            return None
        try:
            return runs[0]["data"]["main"][0][0]["json"]
        except (KeyError, IndexError, TypeError):
            return "<no main json>"


flat = json.load(open(sys.argv[1], encoding="utf-8-sig"))
res = Resolver(flat)
r = res.result()
print("nodes run:", list((r.get("runData") or {}).keys()))
print("last:", r.get("lastNodeExecuted"))
err = r.get("error")
if isinstance(err, dict):
    print("ERROR:", err.get("message"))

for name in sys.argv[2:] or []:
    print(f"\n=== {name} ===")
    print(json.dumps(res.node(r, name), indent=2, ensure_ascii=False)[:1200])