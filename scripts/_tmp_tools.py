"""Print parameters of ai_tool nodes (toolWorkflow) in a workflow."""
import json
import sys

wf = json.load(open(sys.argv[1], encoding="utf-8"))
for n in wf["nodes"]:
    if "toolWorkflow" in n["type"]:
        print("===", n["name"], "===")
        print(json.dumps(n.get("parameters"), indent=2, ensure_ascii=False))