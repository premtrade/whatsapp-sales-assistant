#!/usr/bin/env python3
"""Extract every Code node's jsCode from all workflow files and syntax-check them."""
import json
import os
import subprocess
import sys

WF_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "workflows")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_tmp_codes")
os.makedirs(OUT, exist_ok=True)

files = []
for fn in sorted(os.listdir(WF_DIR)):
    if not fn.endswith(".json"):
        continue
    wf = json.load(open(os.path.join(WF_DIR, fn), encoding="utf-8"))
    for n in wf.get("nodes", []):
        if n.get("type") == "n8n-nodes-base.code":
            code = (n.get("parameters") or {}).get("jsCode") or ""
            if not code.strip():
                continue
            safe = f"{fn[:-5]}__{n['name']}".replace(" ", "_").replace("|", "_").replace("'", "")
            path = os.path.join(OUT, safe + ".js")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(code)
            files.append((fn, n["name"], path))

print(f"extracted {len(files)} code nodes\n")
bad = 0
for fn, name, path in files:
    rel = path.replace(os.path.dirname(path) + os.sep, "").replace("\\", "/")
    r = subprocess.run(
        ["docker", "cp", path, f"n8n:/tmp/chk_{rel}"], capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"  [copy-fail] {fn} :: {name}")
        continue
    r = subprocess.run(
        ["docker", "exec", "n8n", "node", "--check", f"/tmp/chk_{rel}"],
        capture_output=True, text=True,
    )
    status = "OK  " if r.returncode == 0 else "FAIL"
    if r.returncode != 0:
        bad += 1
    print(f"  [{status}] {fn} :: {name}")
    if r.returncode != 0:
        msg = (r.stderr or r.stdout).strip().splitlines()
        for line in msg[:6]:
            print(f"          {line}")
print(f"\n{bad} code node(s) with syntax errors")
sys.exit(1 if bad else 0)
