import bpy,runpy,json
from pathlib import Path
R=Path(__file__).resolve().parent;Q=R.parent/'topology_optimization/research/episode3v7'
bpy.ops.wm.open_mainfile(filepath=str(R/'blender/v7/pavilion-v7.blend'))
lib=runpy.run_path(str(R/'build_pavilion_v7.py'),run_name='lib')
m=json.loads((Q/'pavilion-manifest.json').read_text(encoding='utf8'))
for p in m['parts']:lib['PARTS'][p['id']]={**p,'obj':bpy.data.objects[p['id']]}
for o in bpy.data.objects:
 if o.type=='EMPTY':lib['ROOTS'][o.name]=o
for i in range(4):
 r=bpy.data.objects[f'RAF_{i}_05']
 for sid in ['SUPPORT_X','SUPPORT_Y']:
  s=bpy.data.objects[sid];lo,hi=lib['bounds'](s);cen=[(lo[j]+hi[j])/2 for j in range(3)];dim=[hi[j]-lo[j]+.0002 for j in range(3)]
  lib['boolop'](r,lib['cube']('',cen,dim))
lib['export']()
bpy.ops.wm.save_as_mainfile(filepath=str(R/'blender/v7/pavilion-v7.blend'))
print('MESH_QA',lib['qa_geometry']()['pass'],flush=True)
print('PATH_QA',lib['qa_paths']()['pass'],flush=True)
