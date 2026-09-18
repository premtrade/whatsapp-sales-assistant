"""List which tool sub-workflows were actually invoked in an AI Brain execution."""
import json
import re
import sys

raw = open(sys.argv[1], encoding="utf-8-sig").read()
calls = sorted(set(re.findall(r"Call '([^']+)'", raw)))
print("tool calls / sub-workflow refs found:")
for c in calls:
    print("  -", c)
for marker in ("tool_calls", "intermediateSteps", "appointments", "handoffs", "quotes"):
    n = raw.count(marker)
    if n:
        print(f"  marker {marker!r}: {n} occurrence(s)")