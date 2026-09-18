"""Resolve an n8n flattened execution array and print key node outputs."""
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


def node_output(rd, name):
    runs = rd.get(name)
    if not runs:
        return None
    try:
        return runs[0]["data"]["main"][0][0]["json"]
    except (KeyError, IndexError, TypeError):
        return "<no main output>"


flat = json.load(open(sys.argv[1], encoding="utf-8-sig"))
result = resolve(flat, flat[0]["resultData"])
rd = result.get("runData") or {}

print(f"### {sys.argv[1]}  (nodes run: {list(rd.keys())})")
print("lastNodeExecuted:", result.get("lastNodeExecuted"))
err = result.get("error")
if isinstance(err, dict):
    print("ERROR:", err.get("message"), "| node:", (err.get("node") or {}).get("name"))

wh = node_output(rd, "Webhook") or {}
body = (wh.get("body") or {})
pl = body.get("payload") or {}
print("\n-- webhook payload --")
print("  event      :", body.get("event"))
print("  session    :", body.get("session"))
print("  me.id      :", (body.get("me") or {}).get("id"))
print("  from       :", pl.get("from"))
print("  to         :", pl.get("to"))
print("  fromMe     :", pl.get("fromMe"))
print("  body       :", str(pl.get("body"))[:80])
print("  _data.to   :", (pl.get("_data") or {}).get("to"))

for n in ("Normalize Payload", "Sanitize Inputs", "Status Filter",
          "Supported Event?", "Incoming Message?", "Upsert Contact", "Upsert Conversation"):
    out = node_output(rd, n)
    if out is None:
        print(f"\n-- {n}: (not executed)")
        continue
    if isinstance(out, dict) and n == "Normalize Payload":
        print(f"\n-- {n}: phone={out.get('phone')!r} business_phone={out.get('business_phone')!r} event={out.get('event')!r}")
    else:
        print(f"\n-- {n}: {json.dumps(out)[:300]}")
