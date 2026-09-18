import json

for path in ('workflows/Workflow 2 - AI Brain.json',):
    wf = json.load(open(path, encoding='utf-8'))
    print('==', path)
    for n in wf['nodes']:
        t = n.get('type', '')
        if 'executeWorkflow' in t or 'toolWorkflow' in t or 'agent' in t:
            print(f"  {n['name']!r}")
            print(f"     type={t}  tv={n.get('typeVersion')}")
            p = n.get('parameters', {})
            print(f"     wfId={json.dumps(p.get('workflowId'))}")
            desc = p.get('description') or p.get('toolDescription') or ''
            print(f"     desc={str(desc)[:160]!r}")
