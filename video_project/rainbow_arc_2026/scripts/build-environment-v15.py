"""Authored rain garden: organic wet path, creek, CC0 leaves/rocks/flowers.

Coordinates remain glTF Y-up metres. No geometry over the optical hero (0,4,0).
The experimental basin is centred at (-3,0,3), matching the film's live water.
"""
from pathlib import Path
import bpy, numpy as np, math, json, hashlib, datetime
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v15/environment';OUT.mkdir(parents=True,exist_ok=True)
REVIEW=ROOT/'research/v15/environment/review';REVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
assets=[];rng=np.random.default_rng(150712)

def xyz(p):return (p[0],-p[2],p[1])
def mat(name,c,rough=.65,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if bs is None:
        bs=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(bs.outputs[0],out.inputs['Surface'])
    bs.name='Principled BSDF';bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    return m
def image_mat(name,file,rough=.75,tile=1):
    m=mat(name,(1,1,1),rough);nodes=m.node_tree.nodes;links=m.node_tree.links
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(file));tex.image.pack();links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
    return m
grass=image_mat('v15_photographed_meadow',OUT/'textures/rain_garden_ground_diff_v15.jpg',.92)
stone=image_mat('v15_damp_slate_stone',OUT/'textures/rock_04_diff_1k.jpg',.53)
for material,name,strength in [(stone,'rock_04',.30)]:
    nodes=material.node_tree.nodes;links=material.node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.60,.67,.64,1)
    normal=nodes.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(OUT/f'textures/{name}_nor_gl_1k.jpg'));normal.image.colorspace_settings.name='Non-Color';normal.image.pack()
    nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=strength;links.new(normal.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    rough=nodes.new('ShaderNodeTexImage');rough.image=bpy.data.images.load(str(OUT/f'textures/{name}_rough_1k.jpg'));rough.image.colorspace_settings.name='Non-Color';rough.image.pack();links.new(rough.outputs['Color'],bs.inputs['Roughness'])
rockmat=mat('v15_stream_dark_stones',(.22,.29,.26),.33)
water=image_mat('v15_shallow_creek_water',OUT/'textures/dry_river_pebbles_diff_1k.jpg',.17)
wbs=water.node_tree.nodes.get('Principled BSDF');wbs.inputs['Metallic'].default_value=.20;wbs.inputs['Coat Weight'].default_value=.75;wbs.inputs['Coat Roughness'].default_value=.12
mud=mat('v15_wet_path_grout',(.27,.31,.25),.65)
basinmat=mat('v15_basin_ceramic',(.73,.80,.73),.23)
rim=mat('v15_pool_weathered_limestone',(.63,.69,.62),.43)

def terrain_y(x,z):
    # Near the lesson anchors, a continuous flat meadow stays below y=0.
    r=math.hypot(x,z-3)
    clear=max(0,min(1,(r-7)/7));clear=clear*clear*(3-2*clear)
    broad=.30+1.15*math.sin(x*.072+z*.021)**2+.52*math.sin(z*.104-x*.023)
    detail=.085*math.sin(x*.51+z*.16)*math.cos(z*.33-x*.21)
    return -.07+clear*(max(.01,broad)+detail)
def creek_x(z):return -11+2.3*math.sin(z*.075)+.65*math.sin(z*.23)
def creek_y(z):return -.23+.018*math.sin(z*.13)
def path_x(z):return .6+2.4*math.sin(z*.089)+.42*math.sin(z*.27)

def mesh(name,verts,faces,material,uv=None):
    me=bpy.data.meshes.new(name);me.from_pydata([xyz(v) for v in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);me.materials.append(material);assets.append(o)
    if uv:
        layer=me.uv_layers.new(name='UVMap')
        for p in me.polygons:
            for li in p.loop_indices:layer.data[li].uv=uv[me.loops[li].vertex_index]
    return o

# A continuous curved topography, with a genuine creek depression and basin hole.
nx=140;nz=160;verts=[];uv=[]
for iz in range(nz+1):
    z=-74+iz*114/nz
    for ix in range(nx+1):
        x=-58+ix*116/nx;y=terrain_y(x,z)
        d=abs(x-creek_x(z));channel=math.exp(-(d/2.05)**4)
        y=y*(1-channel)+(creek_y(z)-.18)*channel
        # A unique damp-earth/photo-grass map, rather than a visible tiled lawn.
        verts.append((x,y,z));uv.append(((x+58)/116,(z+74)/114))
faces=[]
for iz in range(nz):
    for ix in range(nx):
        i=iz*(nx+1)+ix
        centre=(np.array(verts[i])+np.array(verts[i+nx+2]))/2
        if math.hypot(centre[0]+3,centre[2]-3)<1.70:continue
        faces.append((i,i+1,i+nx+2,i+nx+1))
ground=mesh('v15_continuous_rain_meadow',verts,faces,grass,uv)
for p in ground.data.polygons:p.use_smooth=True

# Narrow gently wandering stream: water surface stays geometrically continuous.
verts=[];uv=[];faces=[]
for i in range(321):
    z=-65+i*102/320;cx=creek_x(z);width=1.2+.22*math.sin(z*.24)
    for side in [-1,1]:verts.append((cx+side*width,creek_y(z),z));uv.append((side*.5+.5,z/5))
    if i:faces.append((2*i-2,2*i-1,2*i+1,2*i))
stream=mesh('v15_winding_shallow_creek',verts,faces,water,uv)

# Organic paved ribbon provides depth cues without the old repeated brick stripes.
verts=[];uv=[];faces=[]
for i in range(160):
    z=-28+i*47/159;cx=path_x(z);half=1.24+.17*math.sin(z*.17)
    for side in [-1,1]:
        x=cx+side*half;verts.append((x,max(-.029,terrain_y(x,z)+.028),z));uv.append((x/2,z/2))
    if i:faces.append((i*2-2,i*2-1,i*2+1,i*2))
# Individual wet stepping stones sit directly in the meadow. A solid gray
# underlay looked artificial in the first actual render and is retired here.

def polygon_stone(name,x,z,radius):
    n=11;angles=np.linspace(0,2*math.pi,n,endpoint=False)+rng.uniform(-.11,.11,n);rs=radius*rng.uniform(.88,1.12,n)
    y=max(.023,terrain_y(x,z)+.032);vs=[(x+math.cos(a)*r,y+rng.uniform(-.008,.008),z+math.sin(a)*r*.78) for a,r in zip(angles,rs)]
    # Irregular tops are quiet at a distance and retain honest near-field texture.
    uv=[(v[0]*.42,v[2]*.42) for v in vs];o=mesh(name,vs,[tuple(range(n))],stone,uv)
    s=o.modifiers.new('subtle_depth','SOLIDIFY');s.thickness=.068
    b=o.modifiers.new('water_softened_edges','BEVEL');b.width=.029;b.segments=3
    bpy.context.view_layer.objects.active=o
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
for i in range(77):
    z=-25+i*.576+rng.uniform(-.045,.045);cx=path_x(z);x=cx+rng.uniform(-.33,.33)
    # Keep the live fountain basin clear, no hidden crossing pavers.
    if math.hypot(x+3,z-3)<1.95:continue
    polygon_stone('v15_individual_wet_path_stone_%03d'%i,x,z,rng.uniform(.44,.59))

# A small tucked-in physical basin; the live WaterPro layer owns surface animation.
bpy.ops.mesh.primitive_cylinder_add(vertices=112,radius=1.53,depth=.22,location=xyz((-3,-.255,3)));basin=bpy.context.object;basin.name='v15_experiment_basin_floor';basin.data.materials.append(basinmat);assets.append(basin)
bpy.ops.mesh.primitive_torus_add(major_radius=1.60,minor_radius=.115,major_segments=128,minor_segments=16,location=xyz((-3,-.005,3)));o=bpy.context.object;o.name='v15_subtle_experiment_basin_rim';o.scale.z=.58;o.data.materials.append(rim);assets.append(o)

def import_prototype(name,source):
    before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(source));objs=[o for o in scene.objects if o not in before];meshes=[o for o in objs if o.type=='MESH']
    for o in meshes:
        # The provider tree carries nearly two million triangles, unnecessary
        # for a 7-11 m mid-distance canopy. One shared authored LOD is exported
        # for all tree instances rather than duplicating the heavy original.
        ratio=.28 if name=='blue_wildflower' else (.48 if name=='grass_tuft' else 1.)
        if ratio<1 and len(o.data.polygons)>3000:
            bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('v15_shared_film_distance_lod','DECIMATE');mod.ratio=ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)
        for m in o.data.materials:
            if not m or not m.use_nodes:continue
            bs=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if bs:
                bs.inputs['Roughness'].default_value=.74
                if bs.inputs.get('Coat Weight'):bs.inputs['Coat Weight'].default_value=.12
    bpy.context.view_layer.update();points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    lo=Vector((min(v.x for v in points),min(v.y for v in points),min(v.z for v in points)));hi=Vector((max(v.x for v in points),max(v.y for v in points),max(v.z for v in points)))
    centre=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));height=max(.001,hi.z-lo.z)
    # Extract base transforms before source objects are unlinked.
    data=[(o.data,o.matrix_world.copy(),o.name) for o in meshes]
    for o in objs:bpy.data.objects.remove(o,do_unlink=True)
    return {'name':name,'height':height,'centre':centre,'data':data}
def place(proto,index,x,z,height,rotation=0,base_y=None):
    ratio=height/proto['height'];p=Vector(xyz((x,terrain_y(x,z) if base_y is None else base_y,z)))
    transform=Matrix.Translation(p)@Matrix.Rotation(rotation,4,'Z')@Matrix.Scale(ratio,4)@Matrix.Translation(-proto['centre'])
    result=[]
    for data,world,source_name in proto['data']:
        o=bpy.data.objects.new(f'v15_{proto["name"]}_{index:03d}_{source_name}',data);scene.collection.objects.link(o);o.matrix_world=transform@world;assets.append(o);result.append(o)
    return result

tree=import_prototype('real_tree',OUT/'source-models/tree_small_02/tree_small_02_v15_whole_leaf_lod.gltf')
rock=import_prototype('moss_stone',OUT/'source-models/rock_moss_set_01/rock_moss_set_01_1k.gltf')
flower=import_prototype('blue_wildflower',OUT/'source-models/flower_heliophila/flower_heliophila_1k.gltf')
fern=import_prototype('fern',ROOT/'public/assets_v09/environment/source-models/fern_02/fern_02_1k.gltf')
tuft=import_prototype('grass_tuft',ROOT/'public/assets_v09/environment/source-models/grass_medium_01/grass_medium_01_1k.gltf')
shrub=import_prototype('rounded_shrub',ROOT/'public/assets_v09/environment/source-models/shrub_04/shrub_04_1k.gltf')

trees=[(-11,15,8.4),(12,10,8.6),(-14,-6,8.9),(14,-14,7.6),(-21,-21,10.1),(26,-25,9.4),(-32,-36,11.2),(31,-48,10),(-42,-57,11),(43,-61,10.6),(-29,-8,9.7),(24,-3,9.4),(-24,-41,8.8),(19,-38,8.3),(-36,3,11.4),(35,-16,11.5)]
for i,(x,z,h) in enumerate(trees):place(tree,i,x,z,h,i*1.72)

# Tufts are clustered along path/creek edges, not identical evenly spaced spikes.
count=0
for i in range(0):
    z=rng.uniform(-35,22);side=-1 if i%2 else 1;x=path_x(z)+side*rng.uniform(1.6,4.4)
    if math.hypot(x+3,z-3)<2.4:continue
    if math.hypot(x,z)<5.2 and abs(x)<1.8:continue
    place(tuft,i,x,z,rng.uniform(.24,.57),rng.uniform(0,6.28));count+=1

# Fine curved meadow blades produce foreground softness without repetitive
# spiky tree/grass cones. They share one mesh and a restrained fresh-green map.
blade_mat=mat('v15_living_meadow_blades',(.067,.142,.028),.94)
vs=[];fs=[];uv=[]
for i in range(94000):
    z=rng.uniform(-42,25);side=-1 if i%2 else 1;x=path_x(z)+side*rng.uniform(.76,18.0)
    if math.hypot(x+3,z-3)<1.88:continue
    if abs(x-creek_x(z))<1.75:continue
    y=terrain_y(x,z);h=rng.uniform(.065,.175);angle=rng.uniform(0,6.28);bend=rng.uniform(.055,.14);w=rng.uniform(.0024,.0061);base=len(vs)
    for k in range(5):
        q=k/4;cx=x+math.cos(angle)*bend*q*q;cz=z+math.sin(angle)*bend*q*q
        for sign in [-1,1]:vs.append((cx-math.sin(angle)*w*(1-q)*sign,y+h*q,cz+math.cos(angle)*w*(1-q)*sign));uv.append((sign*.5+.5,q))
    fs += [(base+k*2,base+k*2+1,base+k*2+3,base+k*2+2) for k in range(4)]
mesh('v15_soft_curved_foreground_meadow_blades',vs,fs,blade_mat,uv)
for i in range(130):
    z=rng.uniform(-24,19);side=-1 if i%2 else 1;x=creek_x(z)+side*rng.uniform(2.0,3.2)
    place(fern,i,x,z,rng.uniform(.48,.95),rng.uniform(0,6.28))
for i in range(95):
    z=rng.uniform(-50,21);side=-1 if i%2 else 1;x=(creek_x(z)+side*rng.uniform(2.9,5.2)) if i<45 else side*rng.uniform(9,30)
    if math.hypot(x,z)<6 or math.hypot(x+3,z-3)<3:continue
    place(shrub,i,x,z,rng.uniform(.65,1.55),rng.uniform(0,6.28))
for i in range(48):
    z=rng.uniform(-29,21);side=-1 if i%2 else 1;x=path_x(z)+side*rng.uniform(1.65,3.25)
    if math.hypot(x+3,z-3)<2.5:continue
    place(flower,i,x,z,rng.uniform(.23,.43),rng.uniform(0,6.28))
for i in range(104):
    z=rng.uniform(-38,22);x=creek_x(z)+(-1 if i%2 else 1)*rng.uniform(1.4,2.6)
    place(rock,i,x,z,rng.uniform(.28,.72),rng.uniform(0,6.28),creek_y(z)-.02)
# Rounded submerged pebbles are visible through the shallow river and connect
# bank vegetation to a genuine uneven bed; they are shared photographic meshes.
for i in range(115):
    z=rng.uniform(-44,24);x=creek_x(z)+rng.uniform(-.95,.95)
    place(rock,150+i,x,z,rng.uniform(.10,.24),rng.uniform(0,6.28),creek_y(z)-.17)
for i,(x,z,h) in enumerate([(-4.7,4.7,.22),(-4.9,3.8,.24),(-4.3,1.7,.21),(-3.9,1.5,.28),(-1.4,3.8,.25)]):place(rock,40+i,x,z,h,i*1.7,-.028)

# Pack maps once. Every source model is independently licence/hash recorded.
for im in bpy.data.images:
    if im.source=='FILE' and not im.packed_file:
        try:im.pack()
        except RuntimeError:pass
bpy.ops.object.select_all(action='DESELECT')
for o in assets:o.select_set(True)
bpy.context.view_layer.objects.active=ground
glb=OUT/'rain_garden_v15.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_materials='EXPORT',export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False)

# Real camera and render: inspect before accepting the asset.
world=bpy.data.worlds.new('v15_rain_break_soft_sky');scene.world=world;world.use_nodes=True
nodes=world.node_tree.nodes;links=world.node_tree.links;nodes.clear()
env=nodes.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(ROOT/'public/assets_v08/environment/hilly_terrain_01_2k.hdr'));env.image.pack()
mapping=nodes.new('ShaderNodeMapping');mapping.inputs['Rotation'].default_value[2]=-.45
texco=nodes.new('ShaderNodeTexCoord');links.new(texco.outputs['Generated'],mapping.inputs['Vector']);links.new(mapping.outputs['Vector'],env.inputs['Vector'])
bg=nodes.new('ShaderNodeBackground');bg.inputs['Strength'].default_value=.63;wo=nodes.new('ShaderNodeOutputWorld');links.new(env.outputs['Color'],bg.inputs['Color']);links.new(bg.outputs[0],wo.inputs[0])
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.name='v15_soft_rain_break_sun';sun.data.energy=1.8;sun.data.color=(1,.93,.80);sun.data.angle=.095;sun.rotation_euler=Vector((-.22,-.91,-.34)).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA',location=xyz((4,12,2)));fill=bpy.context.object;fill.name='v15_open_sky_fill';fill.data.energy=500;fill.data.color=(.75,.89,1);fill.data.size=22;fill.rotation_euler=(Vector(xyz((0,0,-4)))-fill.location).to_track_quat('-Z','Y').to_euler()
cameras=[]
for name,p,t,lens in [('garden_film', (4.2,2.4,13.4),(0,2.0,-8),31),('garden_low_creek',(-6.8,1.8,11),(-7,.75,-8),37),('garden_orbit',(10.8,5.6,15),(-2,1,-5),33)]:
    bpy.ops.object.camera_add(location=xyz(p));cam=bpy.context.object;cam.name=name;cam.rotation_euler=(Vector(xyz(t))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;cam.data.clip_end=220;cameras.append(cam)
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
try:
    pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='CUDA';pref.get_devices()
    for device in pref.devices:device.use=device.type=='CUDA'
    if any(d.type=='CUDA' for d in pref.devices):scene.cycles.device='GPU'
except Exception:pass
scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.40
scene.camera=cameras[0];blend=OUT/'rain_garden_v15.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for cam in cameras:
    scene.camera=cam;scene.render.filepath=str(REVIEW/(cam.name+'.png'));bpy.ops.render.render(write_still=True)
manifest={'version':'V15','authored':True,'notPhotogrammetry':True,'coordinates':'glTF Y-up metres, original world origin; no asset scale/transform required','waterAnchor':[-3,.025,3],'heroClearanceAnchor':[0,4,0],'sourceLicenses':'source-licenses-v15.json','groundMapProvenance':'ground-map-provenance-v15.json','license':'Authored geometry and Poly Haven CC0-1.0 assets; inherited grass/stone/fern/shrub maps retain their existing provenance','visualDesign':'Continuous damp meadow with unique photo-ground map, rounded wet textured stone ribbon, shallow pebble creek, genuine CC0 leafy trees with whole leaf topology, layered shrubs/ferns/blue wildflowers, mossy banks and 94000 fine curved geometric grass blades; no old circular platform','objects':len(assets),'sourceMeshesCopiedButGeometryShared':True,'generatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':[]}
for p in [glb,blend]:manifest['files'].append({'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
(OUT/'provenance-v15.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'glb':str(glb),'bytes':glb.stat().st_size,'objects':len(assets),'blend':str(blend)}),flush=True)
