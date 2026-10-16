import bpy,sys,json
from pathlib import Path
for label,path in [('pavilion',r'D:/python_project/manim_extend_rainbow/video_project/episode3/lux3d/pavilion_glb.glb'),('joint',r'D:/python_project/manim_extend_rainbow/video_project/episode3/lux3d/joint_glb.glb')]:
 bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
 objs=[]
 for o in bpy.context.scene.objects:
  if o.type=='MESH': objs.append({'name':o.name,'verts':len(o.data.vertices),'dims':[round(x,3) for x in o.dimensions],'loc':[round(x,3) for x in o.location]})
 print(label,json.dumps(objs,ensure_ascii=False))
