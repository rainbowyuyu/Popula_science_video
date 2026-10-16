"""Author a wet garden courtyard around unchanged metric optical anchors.

All V08/V09 originals are read-only. V13 meshes, baked authored stone maps,
editable Blender scene and provenance live in the independent assets_v13.
"""
import bpy, math, json, hashlib, random, datetime
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v13/environment';OUT.mkdir(parents=True,exist_ok=True)
REVIEW=ROOT/'work/environment-v13';REVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/assets_v09/environment/rain_after_terrace_v09.glb'))
scene=bpy.context.scene; rng=random.Random(1313)
retired=[]
for o in list(scene.objects):
    if o.type=='MESH' and o.name.startswith(('v09_grounded_optical_terrace','v09_side_','v09_long_drain','v09_end_','bench_','terrace_','slate_terrace')):
        retired.append(o.name);bpy.data.objects.remove(o,do_unlink=True)

def bsdf(m):
    n=next((n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED"),None)
    if n is None:
        n=m.node_tree.nodes.new("ShaderNodeBsdfPrincipled");out=m.node_tree.nodes.new("ShaderNodeOutputMaterial");m.node_tree.links.new(n.outputs[0],out.inputs[0])
    return n

def material(name,c,rough=.5,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;bs=bsdf(m)
    bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    return m

# Authored limestone variation is a real baked texture, not a screen filter.
N=1024;ys,xs=np.mgrid[:N,:N];prng=np.random.default_rng(1313)
noise=.026*prng.normal(size=(N,N))+.013*np.sin(xs*.021+ys*.008)+.008*np.cos(ys*.08+xs*.02)
noise+=.009*np.sin(xs*.005)*np.cos(ys*.014)
base=np.stack([.67+noise,.66+noise,.60+noise],axis=-1)
pixels=np.ones((N,N,4),dtype=np.float32);pixels[:,:,:3]=np.clip(base,.38,.87)
image=bpy.data.images.new('v13_authored_sandstone',width=N,height=N,alpha=True)
image.pixels.foreach_set(pixels.reshape(-1));image.filepath_raw=str(OUT/'sandstone_diffuse_v13.png');image.file_format='PNG';image.save();image.pack()
slates=[]
for i in range(7):
    m=material(f'v13_sandstone_{i}',(.72,.71,.65),.38+i*.025)
    nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
    texture=nodes.new('ShaderNodeTexImage');texture.image=image;links.new(texture.outputs['Color'],bs.inputs['Base Color'])
    normal=nodes.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(ROOT/'public/assets_v08/environment/textures/slate_floor_02_nor_gl_2k.jpg'),check_existing=True)
    normal.image.colorspace_settings.name='Non-Color';normal.image.pack()
    bump=nodes.new('ShaderNodeNormalMap');bump.inputs['Strength'].default_value=.13
    links.new(normal.outputs['Color'],bump.inputs['Color']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    bs.inputs['Coat Weight'].default_value=.10;bs.inputs['Coat Roughness'].default_value=.27
    slates.append(m)
edge=material('v13_pale_edge_stone',(.51,.52,.47),.50)
grout=material('v13_damp_grout',(.28,.32,.29),.73)
wood=material('v13_rain_washed_oak',(.34,.22,.12),.52)
metal=material('v13_brushed_bronze',(.15,.20,.17),.37,.60)

def bevel(o,w=.015):
    m=o.modifiers.new('crafted_soft_edges','BEVEL');m.width=w;m.segments=3
    m=o.modifiers.new('crafted_weighted_normals','WEIGHTED_NORMAL');m.keep_sharp=True
def cube(name,p,size,m,w=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(p[0],-p[2],p[1]));o=bpy.context.object;o.name=name
    o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(m)
    if w:bevel(o,w)
    return o
def cylinder(name,p,r,depth,m,vertices=96):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=(p[0],-p[2],p[1]));o=bpy.context.object;o.name=name
    o.data.materials.append(m);bevel(o,.013);return o
def cut_basin(o):
    cutter=cylinder('TEMP_actual_fountain_void',(-3,-.20,3),1.69,2,grout)
    mod=o.modifiers.new('preserved_water_opening','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE'
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)

floor=cylinder('v13_curved_garden_paving_base',(0,-.12,3.6),9.35,.20,grout,192);cut_basin(floor)
pavers=[]
for row in range(-9,10):
    z=3.6+row*.88
    for col in range(-8,9):
        x=col*1.19+(row%2)*.595
        if math.hypot(x,z-3.6)>8.9 or math.hypot(x+3,z-3)<2.12:continue
        o=cube(f'v13_hand_laid_paver_{row+9:02d}_{col+8:02d}',(x,-.038,z),(1.175,.065,.862),slates[rng.randrange(7)],.009)
        # Hand-laid micro variation stays below 3mm, keeping optical feet at y=0.
        o.location.z+=rng.uniform(-.0015,.0015);o.rotation_euler.z=rng.uniform(-.001,.001)
        if o.data.uv_layers.active:
            for uv in o.data.uv_layers.active.data:uv.uv.x+=rng.random()*.15
        pavers.append(o)

# Fine stone bands curve with the courtyard instead of framing a black square.
for radius,height,minor in [(9.18,-.015,.10),(9.45,-.065,.11),(9.72,-.115,.13)]:
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=minor,major_segments=192,minor_segments=12,location=(0,-3.6,height))
    o=bpy.context.object;o.name=f'v13_curved_stone_edge_{radius}';o.scale.z=.36;o.data.materials.append(edge)
    for p in o.data.polygons:p.use_smooth=True

# The existing physically recessed fountain is retained. A stone apron makes
# the transition to the paving intentional without intersecting live water.
for radius,minor in [(1.69,.11),(1.90,.095)]:
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=minor,major_segments=128,minor_segments=12,location=(-3,-3,-.014))
    o=bpy.context.object;o.name=f'v13_fountain_apron_{radius}';o.scale.z=.34;o.data.materials.append(edge)
    for p in o.data.polygons:p.use_smooth=True

# Quiet peripheral furniture and low plants supply actual parallax, not cards.
for bi,(x,z,rot) in enumerate([(-6.4,7.2,-.42),(6.4,7.9,.44)]):
    for k in range(5):
        o=cube(f'v13_bench_{bi}_slat_{k}',(x,.46,z+(k-2)*.13),(2.25,.075,.105),wood,.022)
        # Bench group rotation around the centre is shared by the slats/legs.
        dx=o.location.x-x;dy=o.location.y+z;co=math.cos(rot);si=math.sin(rot)
        o.location.x=x+dx*co-dy*si;o.location.y=-z+dx*si+dy*co;o.rotation_euler.z=rot
    for k in [-1,1]:cube(f'v13_bench_{bi}_leg_{k}',(x+k*.84,.22,z),(.075,.46,.42),metal,.018)

plants=[o for o in scene.objects if o.type=='MESH' and any(k in o.name for k in ['fern_02_grounded','grass_medium_01_grounded','shrub_04_grounded'])]
for i in range(54):
    if not plants:break
    source=plants[i%len(plants)];o=source.copy();o.data=source.data;scene.collection.objects.link(o);o.parent=None
    a=i*2.399963;r=10.15+(i%4)*.68;x=math.cos(a)*r;z=3.6+math.sin(a)*r
    o.name=f'v13_garden_cluster_{i:03d}';o.location.x=x;o.location.y=-z;o.location.z=-.065
    o.scale*=.75+.25*rng.random();o.rotation_euler.z+=a

for o in scene.objects:
    if o.type=='MESH':
        for m in o.data.materials:
            if m and m.use_nodes:
                for node in m.node_tree.nodes:
                    if node.type=='TEX_IMAGE' and node.image:
                        try:node.image.pack()
                        except RuntimeError:pass
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    if o.type=='MESH':o.select_set(True)
bpy.context.view_layer.objects.active=floor
asset=OUT/'rain_garden_v13.glb'
bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',use_selection=True,export_apply=True,export_cameras=False,export_lights=False)

world=bpy.data.worlds.new('v13_rain_clearing_light');world.use_nodes=True;scene.world=world
nodes=world.node_tree.nodes;links=world.node_tree.links
texture=nodes.new('ShaderNodeTexEnvironment');texture.image=bpy.data.images.load(str(ROOT/'public/assets_v08/environment/hilly_terrain_01_2k.hdr'));texture.image.pack()
bg=next(n for n in nodes if n.type=='BACKGROUND');links.new(texture.outputs[0],bg.inputs[0]);bg.inputs[1].default_value=.45
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.data.energy=2.1;sun.data.angle=.085;sun.data.color=(1,.94,.83)
sun.rotation_euler=(-Vector((0,-math.cos(math.radians(12)),math.sin(math.radians(12))))).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=960;scene.render.resolution_y=540;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
native=OUT/'rain_garden_v13.blend';bpy.ops.wm.save_as_mainfile(filepath=str(native))
for name,p,target in [('garden_overview',(9,4.8,15),(0,.4,3.6)),('garden_pool',(-6.8,2.7,9),(-3,.1,3))]:
    bpy.ops.object.camera_add(location=(p[0],-p[2],p[1]));cam=bpy.context.object;cam.name=name;cam.data.lens=38
    cam.rotation_euler=(Vector((target[0],-target[2],target[1]))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.camera=cam;scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)
manifest={'version':'V13','generator':'scripts/build-environment-v13.py','blenderVersion':bpy.app.version_string,'createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'coordinates':'glTF Y-up metres. Original water(-3,.025,3), floor0 and optical observer anchors unchanged.','geometry':'Curved wet limestone courtyard, individually bevelled flagstones, recessed fountain apron, stone tread bands, wooden slat benches and real CC0 vegetation meshes.','pavers':len(pavers),'retiredMeshes':retired,'license':'Original authored garden and stone diffuse; reused Poly Haven CC0 plant/slate/grass/HDR source assets with prior provenance preserved.','files':[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [asset,native,OUT/'sandstone_diffuse_v13.png']]}
(OUT/'provenance-v13.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'glb':str(asset),'pavers':len(pavers),'bytes':asset.stat().st_size}))
