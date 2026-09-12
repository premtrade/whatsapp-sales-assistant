import json

with open('workflows/Workflow 2 - AI Brain.json') as f:
    wf = json.load(f)

print('Parse AI Output connections:', wf['connections'].get('Parse AI Output', {}).get('main', []))
print("Call '08 - AI Output Processor' connections:", wf['connections'].get("Call '08 - AI Output Processor'", {}).get('main', []))
