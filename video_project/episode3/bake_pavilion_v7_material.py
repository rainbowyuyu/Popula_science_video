"""Repair only glTF image materials/UVs of the already verified V7 mesh."""
import bpy,runpy,json
from pathlib import Path
R=Path(__file__).resolve().parent;P=R.parent/'topology_optimization';Q=P/'research/episode3v7'
bpy.ops.wm.open_mainfile(filepath=str(R/'blender/v7/pavilion-v7.blend'))
lib=runpy.run_path(str(R/'build_pavilion_v7.py'),run_name='v7_material_lib')
m=json.loads((Q/'pavilion-manifest.json').read_text(encoding='utf8'))
for p in m['parts']:
 o=bpy.data.objects[p['id']];lib['PARTS'][p['id']]={**p,'obj':o};lib['ROOTS'][p['parent']]=bpy.data.objects[p['parent']]
lib['bake_wood_texture']();lib['export']()
bpy.ops.wm.save_as_mainfile(filepath=str(R/'blender/v7/pavilion-v7.blend'))
bpy.context.scene.render.filepath=str(R/'blender/v7/assembled-texture.png');bpy.ops.render.render(write_still=True)
print('V7_MATERIAL_BAKE_FINISHED')
