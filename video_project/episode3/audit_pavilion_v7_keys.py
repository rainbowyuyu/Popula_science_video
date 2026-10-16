"""Audit the exact whole-scene assembly keys used by the video (read only)."""
import bpy,json,runpy,math,itertools
from pathlib import Path
from mathutils import Matrix,Vector
import numpy as np
R=Path(__file__).resolve().parent;P=R.parent/'topology_optimization';Q=P/'research/episode3v7';M=json.loads((Q/'pavilion-manifest.json').read_text(encoding='utf8'))
bpy.ops.wm.open_mainfile(filepath=str(R/'blender/v7/pavilion-v7.blend'))
lib=runpy.run_path(str(R/'build_pavilion_v7.py'),run_name='v7_audit_lib')
parts=[(p,bpy.data.objects[p['id']]) for p in M['parts']]
rests={p['id']:o.matrix_world.copy() for p,o in parts}
def offset(p,t):
 keys=p['assembly_keys']
 if t<=keys[0]['t']:return Vector(keys[0]['offset_blender'])
 for a,b in zip(keys,keys[1:]):
  if t<=b['t']:
   u=(t-a['t'])/(b['t']-a['t']);u=u*u*(3-2*u)
   return Vector(a['offset_blender']).lerp(Vector(b['offset_blender']),u)
 return Vector(keys[-1]['offset_blender'])
times=sorted(set([round(i/100,6) for i in range(101)]+[k['t'] for p,o in parts for k in p['assembly_keys']]))
events=[];checked=0;maxvol=0;cache={}
for ni,t in enumerate(times):
 offsets=[]
 for p,o in parts:
  off=offset(p,t);offsets.append(off)
  m=rests[p['id']].copy();m.translation+=off;o.matrix_world=m
 bpy.context.view_layer.update()
 bbs=[lib['bounds'](o) for p,o in parts];lo=np.array([b[0] for b in bbs]);hi=np.array([b[1] for b in bbs]);overlap=np.minimum(hi[:,None,:],hi[None,:,:])-np.maximum(lo[:,None,:],lo[None,:,:]);pairs=np.argwhere(np.triu(np.all(overlap>1e-6,axis=2),1))
 for ia,ib in pairs:
  pa,oa=parts[ia];pb,ob=parts[ib]
  # Boolean volume is invariant to a shared translation. Cache only exact
  # pair-relative offsets, so stationary waiting parts are not re-solved.
  rel=offsets[ia]-offsets[ib];ck=(int(ia),int(ib),*(round(v,8) for v in rel))
  if ck not in cache:cache[ck]=lib['overlap_volume'](oa,ob);checked+=1
  v=cache[ck];maxvol=max(maxvol,v)
  if v>2e-7:events.append({'t':t,'a':pa['id'],'b':pb['id'],'intersection_volume_m3':v})
 if ni%20==0:
  print('KEY_AUDIT',ni,len(times),'collisions',len(events),flush=True)
  (Q/'global-assembly-partial.json').write_text(json.dumps({'time':t,'collisions':events},indent=2),encoding='utf8')
for p,o in parts:o.matrix_world=rests[p['id']]
report={'method':'whole-scene assembly_keys; cubic smoothstep per key segment; exact Boolean volume after broad phase','samples':len(times),'times':times,'part_count':len(parts),'candidate_pairs_checked':checked,'tolerance_volume_m3':2e-7,'max_intersection_volume_m3':maxvol,'collisions':events,'pass':not events}
(Q/'global-assembly-qa.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('GLOBAL_ASSEMBLY_QA',report['pass'],len(events),flush=True)
