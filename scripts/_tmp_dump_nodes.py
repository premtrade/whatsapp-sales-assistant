import json

wf = json.load(open('workflows/03 - Memory & Context Builder.json', encoding='utf-8'))
print('=== 03 NODES ===')
for n in wf['nodes']:
    p = n.get('parameters', {})
    print(f'\n--- {n["name"]} [{n["type"]}] alwaysOutputData={n.get("alwaysOutputData")} continueOnFail={n.get("continueOnFail")}')
    if 'jsCode' in p:
        print(p['jsCode'][:2500])
    if 'query' in p:
        print('SQL:', p['query'][:1500])
    if 'url' in p:
        print('URL:', p.get('url'), 'METHOD:', p.get('method'))
