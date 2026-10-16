import bpy,sys
bpy.ops.wm.read_factory_settings(use_empty=True)
for f in ['dovetail.glb','half-lap.glb','pegged.glb']:
 bpy.ops.import_scene.gltf(filepath='D:/python_project/manim_extend_rainbow/video_project/topology_optimization/public/episode3v2/models/'+f)
 print('\n'+f)
 for o in list(bpy.context.scene.objects):
  if o.type in {'MESH','EMPTY'}: print(o.name,o.type,'loc',tuple(round(x,3) for x in o.location),'dim',tuple(round(x,3) for x in o.dimensions),'parent',o.parent.name if o.parent else None)
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
