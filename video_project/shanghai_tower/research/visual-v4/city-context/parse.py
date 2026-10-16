import xml.etree.ElementTree as ET,json,math,hashlib
from pathlib import Path
p=Path('research/visual-v4/city-context/osm-map.xml');r=ET.parse(p).getroot();nodes={n.get('id'):(float(n.get('lon')),float(n.get('lat'))) for n in r.findall('node')};ways=[]
for w in r.findall('way'):
 tags={t.get('k'):t.get('v') for t in w.findall('tag')};poly=[nodes[n.get('ref')] for n in w.findall('nd') if n.get('ref') in nodes]
 if not poly:continue
 if 'building' in tags or 'building:part' in tags:ways.append({'id':w.get('id'),'tags':tags,'coords':poly,'center':[sum(x[0] for x in poly)/len(poly),sum(x[1] for x in poly)/len(poly)]})
Path('research/visual-v4/city-context/buildings.json').write_text(json.dumps(ways,ensure_ascii=False,indent=2),encoding='utf8')
for w in ways:
 t=w['tags']
 if 'height' in t or 'building:levels' in t or 'name' in t:print(w['id'],json.dumps({k:v for k,v in t.items() if k in ['name','name:en','height','building:levels','building','building:part']},ensure_ascii=False),w['center'])
print('Building ways',len(ways),'XML hash',hashlib.sha256(p.read_bytes()).hexdigest())
