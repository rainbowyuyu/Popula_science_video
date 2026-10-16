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
times=[0]
events=[];checked=0;maxvol=0
for ni,t in enumerate(times):
 for p,o in parts:
  m=rests[p['id']].copy();m.translation+=offset(p,t);o.matrix_world=m
 bpy.context.view_layer.update()
 bbs=[lib['bounds'](o) for p,o in parts];lo=np.array([b[0] for b in bbs]);hi=np.array([b[1] for b in bbs]);overlap=np.minimum(hi[:,None,:],hi[None,:,:])-np.maximum(lo[:,None,:],lo[None,:,:]);pairs=np.argwhere(np.triu(np.all(overlap>1e-6,axis=2),1))
 for ia,ib in pairs:
  pa,oa=parts[ia];pb,ob=parts[ib];v=lib['overlap_volume'](oa,ob);checked+=1;maxvol=max(maxvol,v)
  if v>2e-7:events.append({'t':t,'a':pa['id'],'b':pb['id'],'intersection_volume_m3':v})
 if ni%20==0:print('KEY_AUDIT',ni,len(times),'collisions',len(events),flush=True)
for p,o in parts:o.matrix_world=rests[p['id']]
report={'method':'whole-scene assembly_keys; cubic smoothstep per key segment; exact Boolean volume after broad phase','samples':len(times),'times':times,'part_count':len(parts),'candidate_pairs_checked':checked,'tolerance_volume_m3':2e-7,'max_intersection_volume_m3':maxvol,'collisions':events,'pass':not events}
(Q/'global-assembly-start-qa.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('GLOBAL_ASSEMBLY_QA',report['pass'],len(events),flush=True)

