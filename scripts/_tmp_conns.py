"""TEMP: report the connection type each AI tool node feeds into."""
import json
import sys

wf = json.load(open(sys.argv[1], encoding="utf-8"))
conns = wf.get("connections", {})
for src, outs in conns.items():
    for ctype, groups in outs.items():
        for group in groups:
            for c in (group or []):
                print(f"{src!r:45} --{ctype}--> {c.get('node')!r}")
print("\n--- tool nodes and their inbound edges ---")
tools = [n["name"] for n in wf["nodes"] if n.get("type") == "@n8n/n8n-nodes-langchain.toolWorkflow"]
for t in tools:
    inbound = []
    for src, outs in conns.items():
        for ctype, groups in outs.items():
            for group in groups:
                for c in (group or []):
                    if c.get("node") == t:
                        inbound.append((src, ctype))
    print(f"  {t}: inbound={inbound or 'NONE  <-- ORPHAN'}")