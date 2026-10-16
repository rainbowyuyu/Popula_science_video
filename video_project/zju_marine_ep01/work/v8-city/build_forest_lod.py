import bpy,os
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
root=r'D:/python_project/manim_extend_rainbow/video_project/zju_marine_ep01'
bpy.ops.import_scene.gltf(filepath=root+'/public/models/v7-city/tree_small_02_lod/tree_small_02_lod.glb')
before=after=0
for ob in bpy.context.scene.objects:
 if ob.type!='MESH':continue
 before+=len(ob.data.polygons)
 mod=ob.modifiers.new('DistantForestLOD','DECIMATE');mod.ratio=.065 if 'leaves' in ob.data.materials[0].name else .15
 bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
 after+=len(ob.data.polygons)
 for p in ob.data.polygons:p.use_smooth=True
out=root+'/public/models/v8-city/tree_small_02_forest.glb'
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_animations=False,export_yup=True)
print('FOREST_LOD',before,after,os.path.getsize(out))
