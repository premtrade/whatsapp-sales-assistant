import sys, json
t = sys.stdin.read()
d = json.loads(t)
for n in d:
    if n.get('type') == 'n8n-nodes-base.executeWorkflow':
        print('=' * 20, n['name'], '=' * 20)
        print(json.dumps(n.get('parameters', {}), indent=2))
        print()
