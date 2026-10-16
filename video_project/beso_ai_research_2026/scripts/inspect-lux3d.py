import bpy, json, math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
ASSET=ROOT/'public/assets/lux3d.glb'
OUT=ROOT/'research/lux3d-inspection'
OUT.mkdir(exist_ok=True,parents=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ASSET))
meshes=[x for x in bpy.context.scene.objects if x.type=='MESH']
corners=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
mn=Vector((min(p.x for p in corners),min(p.y for p in corners),min(p.z for p in corners)))
mx=Vector((max(p.x for p in corners),max(p.y for p in corners),max(p.z for p in corners)))
center=(mn+mx)/2
size=mx-mn
report={'asset':str(ASSET),'meshCount':len(meshes),'vertexCount':sum(len(x.data.vertices) for x in meshes),'polygonCount':sum(len(x.data.polygons) for x in meshes),'bboxMin':list(mn),'bboxMax':list(mx),'center':list(center),'size':list(size),'blenderVersion':bpy.app.version_string}
(OUT/'bbox.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('LUX_BOUNDS='+json.dumps(report))

# Preserve the GLB; transform imported roots inside a new preview scene only.
root=bpy.data.objects.new('Preview_Normalization',None)
bpy.context.collection.objects.link(root)
for obj in list(bpy.context.scene.objects):
    if obj is not root and obj.parent is None:
        obj.parent=root
root.scale=(4/max(size),)*3
root.location=-center*(4/max(size))
bpy.context.view_layer.update()

world=bpy.context.scene.world or bpy.data.worlds.new('Soft studio')
bpy.context.scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.54,0.67,0.74,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
def area(name,loc,energy,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=loc
    ob.rotation_euler=(Vector((0,0,0))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Large key',(-4,-5,6),1250,(1,.95,.88),5)
area('Cool fill',(4,-2,3),900,(.72,.88,1),5)
area('Rim',(0,5,4),1500,(.71,1,1),3)
bpy.ops.object.camera_add(location=(6,-8,4))
camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=5.4
bpy.context.scene.camera=camera
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.render.filepath=str(OUT/'studio-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'studio-inspection.blend'))
bpy.ops.render.render(write_still=True)
