"""Resolve an n8n flattened execution data array and print the webhook payload."""
import json
import sys


def resolve(flat, idx, seen=None):
    """Resolve a value in n8n's flattened execution array."""
    val = flat[idx]
    if isinstance(val, str):
        # A string element that is itself a reference index (digits) is ambiguous;
        # n8n stores real strings directly, references as strings inside objects.
        return val
    if isinstance(val, dict):
        return {k: (resolve(flat, int(v)) if isinstance(v, str) and v.isdigit() and int(v) < len(flat) else v)
                for k, v in val.items()}
    if isinstance(val, list):
        return [resolve(flat, int(v)) if isinstance(v, str) and v.isdigit() and int(v) < len(flat) else v
                for v in val]
    return val


flat = json.load(open(sys.argv[1], encoding="utf-8-sig"))
print("total elements:", len(flat))
root = flat[0]
result = resolve(flat, int(root["resultData"]))
print("\n=== error ===")
print(json.dumps(result.get("error"), indent=2)[:1500])
print("\n=== runData node keys ===")
rd = result.get("runData")
if isinstance(rd, dict):
    for k, v in rd.items():
        print(" -", k)
    # print the webhook input
    for key in ("Webhook", "Normalize Payload"):
        node = rd.get(key)
        if node:
            print(f"\n=== {key} ===")
            print(json.dumps(node, indent=2)[:2500])
