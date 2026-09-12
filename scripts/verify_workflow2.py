import json

with open('workflows/08 - AI Output Processor.json') as f:
    wf = json.load(f)

print('Nodes:')
for n in wf['nodes']:
    print(f"  - {n['name']} ({n['id']})")

print('\nConnections:')
for node_name, conn in wf['connections'].items():
    print(f"  {node_name}:")
    for branch in conn.get('main', []):
        for target in branch:
            print(f"    -> {target['node']}")
    if 'ai_tool' in conn:
        for branch in conn['ai_tool']:
            for target in branch:
                print(f"    [tool] -> {target['node']}")
