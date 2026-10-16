"""Deterministic, minimal ray/AABB explanation model. NOT CS:GO code.
Units are arbitrary illustration units. No damage, penetration, spread or latency emulation.
"""
from pathlib import Path
import json, math
from prepare import write
ROOT=Path(__file__).resolve().parents[2]

def ray_box(origin, direction, lo, hi, max_distance=100.0):
    norm=math.sqrt(sum(v*v for v in direction))
    if norm==0: raise ValueError('zero direction')
    d=[v/norm for v in direction]
    a,b=0.0,max_distance
    for i in range(3):
        if abs(d[i])<1e-12:
            if origin[i]<lo[i] or origin[i]>hi[i]: return None
        else:
            x,y=(lo[i]-origin[i])/d[i],(hi[i]-origin[i])/d[i]
            a,b=max(a,min(x,y)),min(b,max(x,y))
            if a>b: return None
    return a

def first_hit(origin,direction,objects):
    hits=[]
    for ob in objects:
        dist=ray_box(origin,direction,ob['min'],ob['max'])
        if dist is not None: hits.append((dist,ob['id']))
    if not hits: return {'id':None,'distance':None,'point':None}
    distance,name=min(hits)
    length=math.sqrt(sum(v*v for v in direction))
    return {'id':name,'distance':distance,'point':[origin[i]+direction[i]/length*distance for i in range(3)]}

if __name__=='__main__':
    origin=[2.5,-2.8,1.1]
    direction=[0,1,0]
    walls=[{'id':'door_left','min':[.2,-.2,0],'max':[2.05,.1,2.6]}, {'id':'door_right','min':[2.95,-.2,0],'max':[4.8,.1,2.6]}]
    historical={'id':'historical_target','min':[2.22,1.5,0],'max':[2.78,1.95,1.8]}
    current={'id':'current_target','min':[3.42,1.5,0],'max':[3.98,1.95,1.8]}
    visible=first_hit(origin,direction,walls+[historical])
    moved=first_hit(origin,direction,walls+[current])
    blocked=first_hit([1.5,-2.8,1.1],direction,walls+[historical])
    cases=[
       ('gap_to_historical',visible['id']=='historical_target',visible),
       ('same_ray_current_misses',moved['id'] is None,moved),
       ('opaque_door_blocks',blocked['id']=='door_left',blocked),
       ('parallel_outside',ray_box([9,0,1],[0,1,0],[0,0,0],[1,1,2]) is None,None),
       ('inside_box',ray_box([.5,.5,.5],[1,0,0],[0,0,0],[1,1,1])==0,None),
       ('distance_limit',ray_box(origin,direction,historical['min'],historical['max'],1) is None,None),
    ]
    assert all(c[1] for c in cases),cases
    out={'scope':'Educational ray-AABB example, not a CS:GO replay or engine emulation. Doors opaque in this test. No damage, spread, tickrate or real latency claims.', 'origin':origin,'direction':direction,'walls':walls,'historical':historical,'current':current,'hit':visible,'tests':[{'name':n,'pass':ok,'result':r} for n,ok,r in cases]}
    write(ROOT/'work/v01/mechanism.json',json.dumps(out,ensure_ascii=False,indent=2).encode('utf-8'))
    print(json.dumps(out,ensure_ascii=False,indent=2))
