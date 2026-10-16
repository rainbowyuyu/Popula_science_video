"""Refine the optical terrace with genuine CC0 vegetation and ground.

Only reads V08 originals. New runtime GLB goes to assets_v09; heavy native source
and reviews use the C: V09 workspace because D: is nearly full. Metres, Y-up GLB.
"""
import bpy, math, json, hashlib, datetime
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v09/environment'
REVIEW=Path('C:/Users/zju/.codex/visualizations/2026/10/02/01a0fc88-2a0a-7d81-86a9-bfe4cdd86204/rainbow_arc_v09/work/env-review')
OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/assets_v08/environment/rain_after_terrace_v08.glb'))
scene=bpy.context.scene
asset=[]
for o in list(scene.objects):
    if o.type=='MESH':
        if o.name.startswith(('slate_terrace','terrace_low','bench_')):bpy.data.objects.remove(o,do_unlink=True)
        else:asset.append(o)

def material(name,color,rough=.65,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    return m

slate=next(m for m in bpy.data.materials if m.name.startswith('wet_slate_pbr')).copy();slate.name='v09_slate_wet_fine_grain'
stone=material('v09_edge_limestone',(.48,.47,.40),.61)
drain=material('v09_bronze_drain_slots',(.09,.11,.10),.48,.52)
grass=material('grass_ground_v09',(.50,.55,.39),.92)
for m in [slate]:
    bs=m.node_tree.nodes.get('Principled BSDF')
    if bs:
        if bs.inputs.get('Coat Weight'):bs.inputs['Coat Weight'].default_value=.10
        if bs.inputs.get('Coat Roughness'):bs.inputs['Coat Roughness'].default_value=.33
        # No wet mirror flood across the entire floor. Fine normal retains relief.
        for link in list(bs.inputs['Roughness'].links):m.node_tree.links.remove(link)
        bs.inputs['Roughness'].default_value=.59
nodes=grass.node_tree.nodes;links=grass.node_tree.links;bs=nodes.get('Principled BSDF')
uv=nodes.new('ShaderNodeTexCoord')
for kind,file in [('diff','grass_ground_diff_2k.jpg'),('nor','grass_ground_nor_gl_2k.jpg')]:
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(OUT/'textures'/file));tex.image.pack()
    if kind!='diff':tex.image.colorspace_settings.name='Non-Color'
    links.new(uv.outputs['UV'],tex.inputs['Vector'])
    if kind=='diff':
        # Preserve the photographed blades and dirt variation, but art-direct a
        # fresh rain-fed meadow rather than a monochrome brown sports field.
        # This is an authored colour grade, not another acquired measurement.
        original=tex.image
        pixels=np.empty(len(original.pixels),dtype=np.float32);original.pixels.foreach_get(pixels)
        rgba=pixels.reshape((-1,4));rgb=rgba[:,:3]
        lum=rgb@np.array([.2126,.7152,.0722],dtype=np.float32)
        graded=np.stack([lum*.77,lum*1.14,lum*.54],axis=1)
        rgba[:,:3]=np.clip(rgb*.18+graded*.82,0,1)
        fresh=bpy.data.images.new('grass_ground_fresh_grade_v09',width=original.size[0],height=original.size[1],alpha=True)
        fresh.pixels.foreach_set(rgba.reshape(-1));fresh.filepath_raw=str(OUT/'textures'/'grass_ground_fresh_grade_v09.png');fresh.file_format='PNG';fresh.save();fresh.pack()
        tex.image=fresh;links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    else:
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.28
        links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])

def bevel(o,width=.03,segments=3):
    mod=o.modifiers.new('fine_grounded_edge','BEVEL');mod.width=width;mod.segments=segments
    mod=o.modifiers.new('weighted_edge_normals','WEIGHTED_NORMAL');mod.keep_sharp=True

def cube(name,p,size,mat,b=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(p[0],-p[2],p[1]));o=bpy.context.object;o.name=name
    o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat);asset.append(o)
    if b:bevel(o,b)
    return o

def floor_uv(o,metres=2):
    layer=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    for polygon in o.data.polygons:
        for index in polygon.loop_indices:
            p=o.data.vertices[o.data.loops[index].vertex_index].co
            layer.data[index].uv=(p.x/metres,-p.y/metres)

floor=cube('v09_grounded_optical_terrace_14m',(0,-.20,4.2),(14.4,.39,14.6),slate,.04)
floor_uv(floor)
bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=1.50,depth=2,location=(-3,-3,-.12));cutter=bpy.context.object
mod=floor.modifiers.new('actual_basin_recess','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
bpy.context.view_layer.objects.active=floor;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)

# Sparse physical edging, two shallow tread levels, and thin drainage seams.
# These give near/medium depth while keeping every human/optical anchor on y=0.
for side in [-1,1]:
    cube(f'v09_side_edge_{side}',(side*7.32,-.025,4.2),(.24,.19,14.9),stone,.025)
    cube(f'v09_side_tread_{side}',(side*7.58,-.082,4.2),(.36,.11,14.9),stone,.02)
    cube(f'v09_long_drain_{side}',(side*6.94,-.004,4.2),(.08,.010,13.7),drain,.004)
for z in [-3.20,11.60]:
    cube(f'v09_end_tread_{z}',(0,-.05,z),(14.45,.15,.32),stone,.025)
    cube(f'v09_end_second_tread_{z}',(0,-.095,z+(.30 if z>0 else -.30)),(14.9,.09,.32),stone,.02)

# Actual gently rolling nearby ground supports camera parallax, while the
# panorama only supplies the distant mountains. The flat optical anchors stay
# unchanged. Terrain starts below stone treads and rises beyond the clear centre.
def terrain_height(x,z):
    outside=max(abs(x)-7.9,abs(z-4.2)-8.05,0)
    t=min(1,outside/8);blend=t*t*(3-2*t)
    broad=.72+.46*math.sin(x*.115+z*.047)+.37*math.cos(z*.17-x*.043)
    detail=.14*math.sin(x*.38+z*.14)*math.cos(z*.29-x*.12)
    return -.13+blend*max(.10,broad+detail)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=128,y_subdivisions=128,size=1,location=(0,0,0))
ground=bpy.context.object;ground.name='v09_photographed_damp_grass_ground';ground.scale=(100,100,1)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
for vertex in ground.data.vertices:vertex.co.z=terrain_height(vertex.co.x,-vertex.co.y)
ground.data.materials.append(grass);floor_uv(ground,3.1);asset.append(ground)
# The ground is genuinely removed below the fountain: it must never cover the
# original basin floor or leak into the live water surface.
solid=ground.modifiers.new('terrain_boolean_thickness','SOLIDIFY');solid.thickness=.10
bpy.context.view_layer.objects.active=ground;bpy.ops.object.modifier_apply(modifier=solid.name)
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1.86,depth=3,location=(-3,-3,-.45));cutter=bpy.context.object
mod=ground.modifiers.new('clear_original_fountain_basin','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
bpy.context.view_layer.objects.active=ground;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
for polygon in ground.data.polygons:polygon.use_smooth=True

plants=[]
for name in ['fern_02','grass_medium_01','shrub_04']:
    before=set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(OUT/'source-models'/name/(name+'_1k.gltf')))
    imported=[o for o in scene.objects if o not in before]
    meshes=[o for o in imported if o.type=='MESH']
    rgba=bpy.data.images.load(str(OUT/'textures'/(name+'_rgba_v09.png')));rgba.pack()
    materials={m for o in meshes for m in o.data.materials}
    for m in materials:
        for node in m.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image and '_diff_' in node.image.name:node.image=rgba
        bs=m.node_tree.nodes.get('Principled BSDF')
        if bs:bs.inputs['Roughness'].default_value=.80
    locations=[(-8.0,10.4,.62),(-7.85,5.6,.52),(-8.15,-.9,.70),(7.85,10.1,.56),(8.10,6.7,.66),(7.90,1.5,.52),(-7.8,13.1,.70)] if name=='fern_02' else [
      (-7.65,11.5,.42),(-7.8,8.1,.39),(-7.82,2.1,.36),(-8.0,-2.2,.44),(-7.7,13.8,.44),
      (7.70,11.8,.36),(7.88,8.8,.42),(7.85,3.8,.48),(7.75,.0,.41),(8.0,-1.8,.35),
      (-9.0,9.6,.48),(9.0,11.5,.44),(8.2,13.7,.45),(-8.0,14.2,.48)]
    if name=='shrub_04':locations=[]
    # Uneven small clusters, with clear gaps and multiple depth planes. These
    # are actual shared CC0 plant meshes, never spiky procedural tree cones.
    clusters=[(-13.5,15.3),(-18,22),(-25,9),(-31,27),(12.2,16.8),(20.5,23),
              (29,11),(34,29),(-9.2,-9.6),(13.7,-12.5),(-23.4,-19),(26.5,-24)]
    for ci,(cx,cz) in enumerate(clusters):
        count=2 if name=='fern_02' else (1 if name=='shrub_04' else 4)
        for k in range(count):
            angle=ci*2.31+k*2.67;radius=.75+k*.34
            locations.append((cx+math.cos(angle)*radius,cz+math.sin(angle)*radius,
                              (.54 if name=='fern_02' else (1.1 if name=='shrub_04' else .40))+.12*math.sin(ci+k*.73)))
    for i,(x,z,height) in enumerate(locations):
        original=meshes[(i*3)%len(meshes)]
        o=original.copy();o.data=original.data;scene.collection.objects.link(o)
        o.parent=None;o.matrix_world=original.matrix_world.copy();o.name=f'v09_{name}_grounded_{i}'
        bpy.context.view_layer.update()
        points=[o.matrix_world@Vector(c) for c in o.bound_box];lo=min(p.z for p in points);hi=max(p.z for p in points)
        factor=height/max(.001,hi-lo);o.scale*=factor;o.rotation_euler.z+=i*2.17
        bpy.context.view_layer.update()
        points=[o.matrix_world@Vector(c) for c in o.bound_box]
        cx=(min(p.x for p in points)+max(p.x for p in points))/2
        cy=(min(p.y for p in points)+max(p.y for p in points))/2;bottom=min(p.z for p in points)
        o.location+=Vector((x-cx,-z-cy,terrain_height(x,z)-.008-bottom));asset.append(o);plants.append(o)
    for o in imported:bpy.data.objects.remove(o,do_unlink=True)

for image in bpy.data.images:
    if image.source=='FILE' and not image.packed_file:
        try:image.pack()
        except RuntimeError:pass
bpy.ops.object.select_all(action='DESELECT')
for o in asset:o.select_set(True)
bpy.context.view_layer.objects.active=floor
output=OUT/'rain_after_terrace_v09.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,
    export_apply=True,export_materials='EXPORT',export_texcoords=True,export_normals=True,
    export_cameras=False,export_lights=False)

# Review lighting matches low-angle optical sun, with a cool open sky.
world=bpy.data.worlds.new('v09_photographic_open_sky');scene.world=world;world.use_nodes=True
nodes=world.node_tree.nodes;links=world.node_tree.links;nodes.clear()
env=nodes.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(ROOT/'public/assets_v08/environment/hilly_terrain_01_2k.hdr'));env.image.pack()
background=nodes.new('ShaderNodeBackground');background.inputs['Strength'].default_value=.52
output_world=nodes.new('ShaderNodeOutputWorld');links.new(env.outputs[0],background.inputs[0]);links.new(background.outputs[0],output_world.inputs[0])
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.name='v09_true_low_angle_sun';sun.data.energy=2.7;sun.data.color=(1,.93,.79);sun.data.angle=.065
solar=Vector((0,-math.cos(math.radians(12)),math.sin(math.radians(12))))
sun.rotation_euler=(-solar).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA',location=(7,12,13));fill=bpy.context.object;fill.name='v09_cool_sky_fill';fill.data.energy=620;fill.data.color=(.77,.87,1);fill.data.size=16
fill.rotation_euler=(Vector((0,-4,0))-fill.location).to_track_quat('-Z','Y').to_euler()
def camera(name,p,t,lens):
    bpy.ops.object.camera_add(location=(p[0],-p[2],p[1]));o=bpy.context.object;o.name=name
    o.rotation_euler=(Vector((t[0],-t[2],t[1]))-o.location).to_track_quat('-Z','Y').to_euler();o.data.lens=lens
    return o
cameras=[camera('terrace_overview_v09',(11,5.8,16),(0,.25,3.5),35),camera('pool_context_v09',(-6.8,2.15,8),(-3,.42,3),42),camera('wet_stone_detail_v09',(7.8,1.15,12.7),(5.1,-.01,8.6),52),camera('film_angle_v09',(4.5,2.55,12),(0,2.15,3.8),32)]
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.camera=cameras[0]
blend=REVIEW/'rain_after_terrace_v09.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for cam in cameras:
    scene.camera=cam;scene.render.filepath=str(REVIEW/(cam.name+'.png'));bpy.ops.render.render(write_still=True)
manifest={'version':'V09','generator':'scripts/build-environment-v09.py','blender':bpy.app.version_string,
  'generatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'coordinates':'glTF Y-up metres; optical floor y=-.005, water(-3,.025,3), unchanged observer feet0',
  'geometry':'14.4m x14.6m terrace, actual pool and ground recesses, shallow edge treads, bronze drainage, gentle rolling photographic meadow,105 actual CC0 plants in sparse clusters; no new actor or ray geometry',
  'grassAdaptation':'Authored luminance-preserving fresh-green grade of CC0 grass_ground diffuse; original provider image retained',
  'license':'Authored terrace plus Poly Haven CC0 source-models/texture maps; V08 originals read only',
  'blenderSourceLocator':str(blend),'reviewFolder':str(REVIEW),'objects':len(asset),'plantObjects':len(plants),'files':[]}
for path in [OUT/'rain_after_terrace_v09.glb',blend,OUT/'textures'/'grass_ground_fresh_grade_v09.png']:
    data=path.read_bytes();manifest['files'].append({'file':path.name,'path':str(path),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(OUT/'provenance-v09.json').write_text(json.dumps(manifest,indent=2),'utf8')
print(json.dumps({'objects':len(asset),'plants':len(plants),'glb':str(OUT/'rain_after_terrace_v09.glb'),'bytes':(OUT/'rain_after_terrace_v09.glb').stat().st_size,'blend':str(blend)}))
