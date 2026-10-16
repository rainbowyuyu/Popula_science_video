from pathlib import Path
import json, math, xml.etree.ElementTree as ET
class Polygon:
 def __init__(self,pts):
  import types
  ox,oy=pts[0];q=[(x-ox,y-oy) for x,y in pts];pairs=list(zip(q,q[1:]+q[:1]));a=sum(x*v-u*y for (x,y),(u,v) in pairs)
  cx=sum((x+u)*(x*v-u*y) for (x,y),(u,v) in pairs)/(3*a) if abs(a)>1e-18 else sum(p[0] for p in q)/len(q)
  cy=sum((y+v)*(x*v-u*y) for (x,y),(u,v) in pairs)/(3*a) if abs(a)>1e-18 else sum(p[1] for p in q)/len(q)
  self.centroid=types.SimpleNamespace(x=ox+cx,y=oy+cy)
w=json.load(open('research/visual-v4/city-context/buildings.json',encoding='utf8'));tower=next(b for b in w if b['id']=='165792123');ctr=Polygon(tower['coords']).centroid;lon,lat=ctr.x,ctr.y
project=lambda p: [(p[0]-lon)*111320*math.cos(math.radians(lat)),-(p[1]-lat)*111132]
selected=[]
for b in w:
 t=b['tags'];h=t.get('height','');poly=b['coords'];c=Polygon(poly).centroid if len(poly)>3 else None
 if c is None or not h.replace('.','',1).isdigit() or 'building' not in t or b['id']=='165792123':continue
 x,z=project([c.x,c.y]);dist=math.hypot(x,z)
 if dist>650:continue
 selected.append({'osmWay':int(b['id']),'name':t.get('name:en',t.get('name','')),'height_m':float(h),'center_m':[x,z],'polygon_m':[project(p) for p in poly],'source':t.get('source','OpenStreetMap building outline'),'wikipedia':t.get('wikipedia','')})
r=ET.parse('research/visual-v4/city-context/osm-map.xml').getroot();nodes={n.get('id'):(float(n.get('lon')),float(n.get('lat'))) for n in r.findall('node')};roads=[]
for way in r.findall('way'):
 t={a.get('k'):a.get('v') for a in way.findall('tag')}
 if t.get('highway') not in ['primary','secondary','tertiary','residential','unclassified']:continue
 pts=[project(nodes[n.get('ref')]) for n in way.findall('nd') if n.get('ref') in nodes]
 if not pts or min(math.hypot(*p) for p in pts)>750:continue
 roads.append({'osmWay':int(way.get('id')),'name':t.get('name:en',t.get('name','')),'class':t['highway'],'points_m':pts})
d={'schema':'rainbow.osm-city-context/1','projection':'Local tangent approximation; x east, z south; metres; WGS84 OSM only. Educational tower has not been geographically yaw-registered.','origin_WGS84':[lon,lat],'source':'https://api.openstreetmap.org/api/0.6/map?bbox=121.501,31.231,121.510,31.239','license':'Open Database License; © OpenStreetMap contributors','buildings':selected,'roads':roads,'scope':'Verified OSM outline/height tags for quiet geographic context only; not part of the structural or CFD solver mesh.'}
Path('research/visual-v4/city-context/city-data.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'origin':[lon,lat],'buildings':[{k:b[k] for k in ['name','height_m','center_m']} for b in selected],'roads':len(roads)},ensure_ascii=True,indent=2))
