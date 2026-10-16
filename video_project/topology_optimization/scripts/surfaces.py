from pathlib import Path
import json,numpy as np,contourpy
R=Path(__file__).resolve().parents[1];p=R/'public/v3/simulation.json';d=json.loads(p.read_text('utf8'))
surfaces=[]
for h in d['history']:
 z=np.pad(np.array(h['density']).reshape(d['ny'],d['nx']),1)
 cg=contourpy.contour_generator(x=(np.arange(d['nx']+2)-.5)*.1-4,y=(np.arange(d['ny']+2)-.5)*.1,z=z,fill_type='OuterOffset')
 pts,offs=cg.filled(.5,1.01)
 groups=[]
 for a,o in zip(pts,offs):groups.append([np.round(a[o[i]:o[i+1]],5).tolist() for i in range(len(o)-1)])
 surfaces.append(groups)
d['surfaces']=surfaces;p.write_text(json.dumps(d,separators=(',',':')),encoding='utf8')
(R/'src/v3/simulation.json').write_text(json.dumps(d,separators=(',',':')),encoding='utf8')
print('surface states',len(surfaces),'final polygons',len(surfaces[-1]))
