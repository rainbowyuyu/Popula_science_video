import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='D:/python_project/manim_extend_rainbow/video_project/topology_optimization/public/episode3v2/models/crafted-pavilion.glb')
for o in bpy.context.scene.objects:
 if o.type=='MESH': print(o.name,'loc',tuple(round(x,3) for x in o.location),'dim',tuple(round(x,3) for x in o.dimensions),'parent',o.parent.name if o.parent else None)
