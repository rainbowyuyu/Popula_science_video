import bpy,runpy,json
from pathlib import Path
R=Path(__file__).resolve().parent;Q=R.parent/'topology_optimization/research/episode3v7'
bpy.ops.wm.open_mainfile(filepath=str(R/'blender/v7/pavilion-v7.blend'))
lib=runpy.run_path(str(R/'build_pavilion_v7.py'),run_name='lib')
m=json.loads((Q/'pavilion-manifest.json').read_text(encoding='utf8'))
for p in m['parts']:lib['PARTS'][p['id']]={**p,'obj':bpy.data.objects[p['id']]}
print('GEOMETRY_QA',lib['qa_geometry']()['pass'],flush=True)
print('PATH_QA',lib['qa_paths']()['pass'],flush=True)
