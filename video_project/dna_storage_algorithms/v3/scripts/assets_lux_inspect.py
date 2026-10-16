import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/3d'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'lux-vial-holder-source/vial-holder_glb.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
scale=.18/max(hi-lo);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));tf=Matrix.Scale(scale,4)@Matrix.Translation(-center)
roots=[o for o in bpy.context.scene.objects if o.parent is None]
for o in roots:o.matrix_world=tf@o.matrix_world
bpy.context.view_layer.update()
for i,o in enumerate(meshes):o.name='LUX_GENERATED_VIAL_HOLDER_%02d'%i;o['source']='Lux3D G1 task 4046716, original preserved';o['scale_basis']='Art-directed display: longest dimension 0.18m, no asserted measurement'
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
out=OUT/'lux_vial_holder.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_animations=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
scene.render.resolution_x=1080;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
m=bpy.data.materials.new('LUX_PREVIEW_GROUND');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.77,.82,.80,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.7
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.0005));bpy.context.object.data.materials.append(m)
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.82,.83,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
for loc,power,size,col in [((-.30,-.35,.50),20,.6,(.90,.96,1)),((.3,.2,.3),12,.4,(1,.87,.71))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=col;o.rotation_euler=(Vector((0,0,.065))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.25,-.34,.20));cam=bpy.context.object;scene.camera=cam;cam.data.lens=55;cam.data.clip_start=.002;cam.rotation_euler=(Vector((0,0,.080))-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'lux_vial_holder_inspected.blend'))
scene.render.filepath=str(OUT/'lux-vial-holder-preview.png');bpy.ops.render.render(write_still=True)
record={'sourceTask':'4046716','rawSource':'lux-vial-holder-source/vial-holder_glb.glb','normalizedExport':out.name,'normalization':'Longest bounding dimension 0.18m; center X/Y; base Z=0 in Blender; GLB exported Y-up. Art-directed scale, not measured real object.','sourceBoundsBlender':{'min':list(lo),'max':list(hi)},'meshCount':len(meshes),'triangles':sum(len(o.data.polygons) for o in meshes),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
(ROOT/'research/tool-lux-local-inspection.json').write_text(json.dumps(record,indent=2),encoding='utf8')
