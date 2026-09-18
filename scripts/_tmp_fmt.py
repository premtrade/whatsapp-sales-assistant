import json
for p in ('workflows/Workflow 2 - AI Brain.json', 'workflows/08 - AI Output Processor.json'):
    wf = json.load(open(p, encoding='utf-8'))
    print('#####', p)
    for n in wf['nodes']:
        if n['name'] == 'Format Context' and 'jsCode' in n.get('parameters', {}):
            print(n['parameters']['jsCode'])
        elif p.endswith('08 - AI Output Processor.json'):
            print('  -', n['name'], '|', n['type'])