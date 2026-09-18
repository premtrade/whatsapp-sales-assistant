import json
wf = json.load(open('workflows/Workflow 2 - AI Brain.json', encoding='utf-8'))
for n in wf['nodes']:
    if n['name'] == 'Parse AI Output':
        print(n['parameters']['jsCode'])