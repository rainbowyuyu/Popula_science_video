from pathlib import Path
p=Path('research/visual-v4/city-context/select-context.py');s=p.read_text(encoding='utf-8-sig').replace('from shapely.geometry import Polygon','''class Polygon:
 def __init__(self,pts):
  import types
  ox,oy=pts[0];q=[(x-ox,y-oy) for x,y in pts];pairs=list(zip(q,q[1:]+q[:1]));a=sum(x*v-u*y for (x,y),(u,v) in pairs)
  cx=sum((x+u)*(x*v-u*y) for (x,y),(u,v) in pairs)/(3*a) if abs(a)>1e-18 else sum(p[0] for p in q)/len(q)
  cy=sum((y+v)*(x*v-u*y) for (x,y),(u,v) in pairs)/(3*a) if abs(a)>1e-18 else sum(p[1] for p in q)/len(q)
  self.centroid=types.SimpleNamespace(x=ox+cx,y=oy+cy)''');p.write_text(s,encoding='utf8')
