from pathlib import Path
import json,math
p=Path('research/visual-v4/city-context/city-data.json');d=json.loads(p.read_text(encoding='utf8'));w=json.load(open('research/visual-v4/city-context/buildings.json',encoding='utf8'));lon,lat=d['origin_WGS84'];project=lambda p:[(p[0]-lon)*111320*math.cos(math.radians(lat)),-(p[1]-lat)*111132]
for main in d['buildings']:
 if main['osmWay'] not in [10691100,376075961]:continue
 main['parts']=[]
 for b in w:
  t=b['tags'];h=t.get('height','')
  if 'building:part' not in t or not h.replace('.','',1).isdigit():continue
  x,z=project(b['center']);cx,cz=main['center_m']
  if math.hypot(x-cx,z-cz)>65:continue
  main['parts'].append({'osmWay':int(b['id']),'height_m':float(h),'min_height_m':float(t.get('min_height','0')),'roof_shape':t.get('roof:shape','flat'),'roof_height_m':float(t.get('roof:height','0')),'polygon_m':[project(v) for v in b['coords']]})
p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8');print('parts',[(b['name'],len(b.get('parts',[]))) for b in d['buildings']])
