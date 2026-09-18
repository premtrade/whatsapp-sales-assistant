import json
wf = json.load(open('workflows/03 - Memory & Context Builder.json', encoding='utf-8'))
wf['id'] = 'p27V1gltwfeIX2yA'
json.dump(wf, open('workflows/03 - Memory & Context Builder.json','w',encoding='utf-8'), indent=2, ensure_ascii=False)
print('set id p27V1gltwfeIX2yA')