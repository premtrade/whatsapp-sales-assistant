import json

wf = json.load(open('workflows/Workflow 2 - AI Brain.json', encoding='utf-8'))
n = [x for x in wf['nodes'] if x['name'] == 'Parse AI Output'][0]
code = n['parameters']['jsCode']
with open('scripts/_tmp_parse_split.js', 'w', encoding='utf-8') as f:
    for i in range(0, len(code), 900):
        f.write(code[i:i + 900] + '\n----\n')
print('chars', len(code))
print('lines', code.count(';'))
