import json
w=json.load(open('research/visual-v4/city-context/buildings.json',encoding='utf8'))
for b in w:
 if b['id'] in ['10691100','376075961','188377486','376016310','376016312','279942892','279942896']:
  print(b['id'],json.dumps(b['tags'],ensure_ascii=True))
