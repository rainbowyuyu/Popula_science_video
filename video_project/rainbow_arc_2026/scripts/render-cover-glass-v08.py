"""Render original V08 spherical raindrop as a transparent Cycles sheen plate."""
from pathlib import Path
import bpy,json,hashlib
from mathutils import Vector
root=Path(__file__).resolve().parents[1];out=root/'public/assets_v08/covers';out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'public/assets_v08/macro/spherical_raindrop_v08.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:
    o.data.materials.clear()
    m=bpy.data.materials.new('cover_water_ior_1333');m.use_nodes=True;m.node_tree.nodes.clear()
    bs=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');bs.inputs['Base Color'].default_value=(.97,.995,1,1)
    bs.inputs['Roughness'].default_value=.006;bs.inputs['Transmission Weight'].default_value=1;bs.inputs['IOR'].default_value=1.333
    bs.inputs['Coat Weight'].default_value=.18;bs.inputs['Coat Roughness'].default_value=.018
    op=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(bs.outputs['BSDF'],op.inputs['Surface']);o.data.materials.append(m)
    o.location=(0,0,0)
scene=bpy.context.scene
scene.world.use_nodes=True;ns=scene.world.node_tree.nodes;ls=scene.world.node_tree.links;ns.clear()
env=ns.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(root/'public/assets_v08/environment/hilly_terrain_01_2k.hdr'));env.image.pack()
bg=ns.new('ShaderNodeBackground');bg.inputs['Strength'].default_value=.47;op=ns.new('ShaderNodeOutputWorld');ls.new(env.outputs['Color'],bg.inputs['Color']);ls.new(bg.outputs[0],op.inputs[0])
def area(name,p,power,size,ratio):
    bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='RECTANGLE';o.data.size=size;o.data.size_y=size*ratio
    o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
area('long_sky_strip',(-3,-2.8,2.5),330,3.0,.11)
area('quiet_top_softbox',(1.7,-.5,4),80,2.2,.45)
bpy.ops.object.camera_add(location=(0,-6.8,.24));cam=bpy.context.object;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=64;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.film_transparent=True;scene.cycles.film_transparent_glass=True
scene.render.resolution_x=1280;scene.render.resolution_y=1280;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX'
scene.render.filepath=str(out/'cover_glass_sheen_v08.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cover_glass_v08.blend'));bpy.ops.render.render(write_still=True)
records=[]
for p in [out/'cover_glass_sheen_v08.png',out/'cover_glass_v08.blend']:
    records.append({'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(out/'provenance.json').write_text(json.dumps({'source':'V08 spherical raindrop GLB, authored Blender','reflection':'CC0 hilly_terrain_01 HDRI','water_ior':1.333,'roughness':.006,'tool':'Blender Cycles '+bpy.app.version_string,'use':'Transparent reflection/sheens for separate refracted illustration cover; not a measurement','outputs':records},indent=2),encoding='utf8')
