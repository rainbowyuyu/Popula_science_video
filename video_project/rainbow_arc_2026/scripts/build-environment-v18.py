"""Derive a natural irregular stone pool from the frozen V15 garden.

Reads only inherited assets. Writes only assets_v18/environment and this
round's review. Coordinates are glTF Y-up metres, live water [-3,.025,3].
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets_v18/environment'
REVIEW = ROOT / 'research/iterations/v18/environment'
OUT.mkdir(parents=True, exist_ok=True)
REVIEW.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--render', action='store_true')
parser.add_argument('--gpu', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
SOURCE = ROOT / 'public/assets_v16/environment/rain_garden_v16.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
rng = np.random.default_rng(180713)

def xyz(p):
    return (p[0], -p[2], p[1])

# V18 visual direction: a restrained hand-painted rain garden. Keep all
# source meshes/maps intact; only tune linear PBR parameters and add explicit
# metadata consumed by the deterministic Three.js wind/light pass.
scene['v18_style'] = 'hand-painted watercolor edges + physically based wet surfaces'
scene['v18_wind_seed'] = 180713
scene['v18_wind_strength'] = 0.028
scene['v18_wind_period_seconds'] = 9.0
scene['v18_rain_light'] = 'warm key / cool fill / wet rim'
scene['v18_rainbow_scale'] = 1.12

def tune_material(name, color=None, roughness=None, coat=None, sheen=None):
    mat = bpy.data.materials.get(name)
    if not mat or not mat.use_nodes: return False
    bs = mat.node_tree.nodes.get('Principled BSDF')
    if not bs: return False
    if color is not None: bs.inputs['Base Color'].default_value = (*color, 1)
    if roughness is not None: bs.inputs['Roughness'].default_value = roughness
    if coat is not None and 'Coat Weight' in bs.inputs: bs.inputs['Coat Weight'].default_value = coat
    if sheen is not None and 'Sheen Weight' in bs.inputs: bs.inputs['Sheen Weight'].default_value = sheen
    mat['v18_painted_palette'] = True
    return True

# Linear values chosen to land as soft mint/olive after AgX, while preserving
# photographic maps and the readable rain-washed contrast of the garden.
tune_material('tree_small_02_leaves', (0.095, 0.245, 0.135), .70, .12, .08)
tune_material('fern_02', (0.105, 0.285, 0.155), .76, .08, .10)
tune_material('shrub_04', (0.115, 0.265, 0.145), .82, .06, .06)
tune_material('v15_living_meadow_blades', (0.032, 0.105, 0.040), .90, .02, .04)
tune_material('v15_photographed_meadow', (0.72, 0.81, 0.70), .88, .08, .03)
tune_material('v16_damp_earth_shore', (0.12, 0.17, 0.09), .91, .03, .02)
tune_material('v18_damp_earth_shore', (0.12, 0.17, 0.09), .91, .03, .02)

# Deterministic wet-after-rain lighting rig retained in the .blend for review.
# Runtime reproduces the same light family; keyframes are a provenance aid and
# make the Blender source immediately art-directable.
def add_v18_area(name, loc, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.shape = 'DISK'; data.size = size; data.color = color
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = xyz(loc)
    obj.rotation_euler = (Vector(xyz((0, 0.35, 3))) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj
warm = add_v18_area('V18 Rain After Warm Key', (-7.0, 9.0, 11.0), 900, 7.5, (1.0, .82, .63))
cool = add_v18_area('V18 Rain After Cool Fill', (8.0, 6.0, 1.0), 430, 10.0, (.62, .84, 1.0))
rim = add_v18_area('V18 Rain After Wet Rim', (0.0, 4.5, -10.0), 520, 5.5, (.72, .92, .98))
for light, base, phase in ((warm,900,0.0),(cool,430,1.7),(rim,520,3.2)):
    light.data.energy = base; light.data.keyframe_insert('energy', frame=1)
    light.data.energy = base*1.055; light.data.keyframe_insert('energy', frame=45)
    light.data.energy = base*.97; light.data.keyframe_insert('energy', frame=90)
    light.data.energy = base; light.data.keyframe_insert('energy', frame=135)
    if light.animation_data and light.animation_data.action:
        for fc in light.animation_data.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'
    light['v18_phase'] = phase; light['v18_frame_driven'] = True


def xyz(p):
    return (p[0], -p[2], p[1])


def edge_radius(a):
    return 1 + .083*math.sin(3*a+.4) + .045*math.cos(5*a-.6) + .026*math.sin(7*a+1.3)


def pond_point(a, q=1):
    r = edge_radius(a)*q
    return -3+1.57*math.cos(a)*r, 3+1.34*math.sin(a)*r


def new_mesh(name, vertices, faces, material, uv=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    data.materials.append(material)
    if uv:
        layer = data.uv_layers.new(name='UVMap')
        for poly in data.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uv[data.loops[li].vertex_index]
    for poly in data.polygons:
        poly.use_smooth = True
    return obj


# Remove the actual white ceramic dish and perfectly circular torus, including
# the five old local stone clusters. The garden and originals are read-only.
removed = []
for obj in list(scene.objects):
    is_dish = obj.name in ['v15_experiment_basin_floor', 'v15_subtle_experiment_basin_rim']
    is_local_rock = obj.type == 'MESH' and 'moss_stone' in obj.name and abs(obj.location.x+3)<3.1 and abs(-obj.location.y-3)<3.1
    # V16 already contains its derived pond (including pivot empties); remove
    # that derived layer before rebuilding V18 so GLB has no orphan pivots or
    # coincident duplicate beds/pebbles.
    is_prior_v16 = obj.name.startswith('v16_')
    if is_dish or is_local_rock or is_prior_v16:
        removed.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)

# Continuously graded bank covers the previous coarse-grid circular opening.
# Inner pebble bed slopes to ~20 cm depth, never leaves an exposed mesh hole.
ground = bpy.data.materials['v15_photographed_meadow']
bed = bpy.data.materials['v15_shallow_creek_water'].copy()
bed.name = 'v18_submerged_natural_pebble_bed'
bs = next(n for n in bed.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Roughness'].default_value = .74
bs.inputs['Metallic'].default_value = 0
bs.inputs['Coat Weight'].default_value = .15
bank = bpy.data.materials.new('v18_damp_earth_shore')
bank.use_nodes=True
bs_bank = next(n for n in bank.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bs_bank.inputs['Base Color'].default_value = (.16, .205, .12, 1)
bs_bank.inputs['Roughness'].default_value = .88

n = 160
rings = [0, .16, .34, .54, .73, .88, 1.0, 1.07, 1.15, 1.29, 1.50, 1.78]
vertices, uvs, faces = [], [], []
for q in rings:
    for i in range(n):
        a = i/n*math.tau
        x, z = pond_point(a, q)
        if q < 1:
            y = -.23 + .21*(q**2.8) + .008*math.sin(a*5)*q
        else:
            y = -.018 - .040*min(1, (q-1)/.2)
        vertices.append((x, y, z))
        uvs.append((x*.90, z*.90))
for j in range(len(rings)-1):
    for i in range(n):
        k=j*n+i; kn=j*n+(i+1)%n
        faces.append((k, kn, kn+n, k+n))
shore = new_mesh('v18_continuous_pond_bed_and_graded_shore', vertices, faces, bed, uvs)
shore.data.materials.append(bank)
shore.data.materials.append(ground)
for poly in shore.data.polygons:
    ring_index=poly.index//n
    poly.material_index=0 if ring_index<6 else 1 if ring_index<8 else 2
# Grass portion uses the unique world-projected meadow map, matching its parent.
layer=shore.data.uv_layers[0]
for poly in shore.data.polygons:
    if poly.material_index==2:
        for li in poly.loop_indices:
            p=shore.data.vertices[shore.data.loops[li].vertex_index].co
            layer.data[li].uv=((p.x+58)/116,(-p.y+74)/114)

# Use one genuine photographed CC0 stone mesh per instance, recentered in its
# own bounds. It is rough natural stone with shared texture, never a primitive.
prototypes=[]
for obj in scene.objects:
    if obj.type=='MESH' and 'moss_stone_000_' in obj.name:
        data=obj.data
        coords=np.array([v.co[:] for v in data.vertices])
        lo=coords.min(axis=0);hi=coords.max(axis=0)
        prototypes.append((data,(lo+hi)/2,hi-lo))
assert prototypes, 'Frozen CC0 rock prototypes absent'


def stone(index, x, z, radius, height, y, angle, submerged=False):
    data,center,bounds=prototypes[index%len(prototypes)]
    obj=bpy.data.objects.new(('v18_submerged_pebble_' if submerged else 'v18_natural_shore_rock_')+str(index).zfill(3), data)
    scene.collection.objects.link(obj)
    # mesh pivot is normalized explicitly; parent provides location/rotation.
    pivot=bpy.data.objects.new('v18_stone_pivot_'+str(index).zfill(3),None)
    scene.collection.objects.link(pivot)
    pivot.location=xyz((x,y,z));pivot.rotation_euler.z=angle
    obj.parent=pivot
    obj.scale=(radius*2/max(bounds[0],.001),radius*1.60/max(bounds[1],.001),height/max(bounds[2],.001))
    obj.location=tuple(-float(center[i])*obj.scale[i] for i in range(3))
    obj.location.z+=height*.40
    obj['v16_pool_support']=True
    return obj

for i in range(34):
    a=i/34*math.tau+rng.uniform(-.028,.028)
    x,z=pond_point(a,1.035+rng.uniform(-.035,.095))
    stone(i,x,z,rng.uniform(.18,.31),rng.uniform(.12,.27),-.065,rng.uniform(0,math.tau))
# Sparse bank stones preserve open gaps and an uneven shoreline.
for i in range(34,48):
    a=rng.uniform(0,math.tau);x,z=pond_point(a,rng.uniform(1.16,1.40))
    stone(i,x,z,rng.uniform(.09,.19),rng.uniform(.07,.16),-.06,rng.uniform(0,math.tau))
for i in range(160):
    a=rng.uniform(0,math.tau);q=math.sqrt(rng.uniform(.01,.90));x,z=pond_point(a,q)
    y=-.23+.21*q**2.8
    stone(100+i,x,z,rng.uniform(.026,.069),rng.uniform(.025,.060),y,rng.uniform(0,math.tau),True)

# A subtle world-UV water preview exists in Blender only. Runtime WaterPro
# owns the animated reflected/refracted surface and uses exactly this boundary.
watermat=bpy.data.materials.new('v18_preview_clear_water');watermat.use_nodes=True
pbs=watermat.node_tree.nodes.get('Principled BSDF') or next((n for n in watermat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
if pbs is None:
    watermat.node_tree.nodes.clear(); pbs=watermat.node_tree.nodes.new('ShaderNodeBsdfPrincipled'); out=watermat.node_tree.nodes.new('ShaderNodeOutputMaterial'); watermat.node_tree.links.new(pbs.outputs['BSDF'],out.inputs['Surface'])
pbs.inputs['Base Color'].default_value=(.58,.76,.70,1)
pbs.inputs['Roughness'].default_value=.055
pbs.inputs['IOR'].default_value=1.333
pbs.inputs['Transmission Weight'].default_value=.92
pbs.inputs['Coat Weight'].default_value=.15
vs=[(-3,.025,3)] + [(lambda p:(p[0],.025,p[1]))(pond_point(i/n*math.tau,.997)) for i in range(n)]
fs=[(0,i+1,(i+1)%n+1) for i in range(n)]
preview_water=new_mesh('v18_blender_only_water_preview',vs,fs,watermat)

scene.render.engine='CYCLES';scene.cycles.samples=28;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
if args.gpu:
    try:
        pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='CUDA';pref.get_devices()
        for d in pref.devices:d.use=d.type=='CUDA'
        if any(d.type=='CUDA' for d in pref.devices):scene.cycles.device='GPU'
    except Exception:pass
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.view_settings.exposure=.20
blend=OUT/'rain_garden_v18.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
preview_water.hide_render=True
bpy.ops.object.select_all(action='DESELECT')
export_objects=[o for o in scene.objects if o.type=='MESH' and o!=preview_water]
for obj in export_objects:obj.select_set(True)
glb=OUT/'rain_garden_v18.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,
    export_materials='EXPORT',export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False)
preview_water.hide_render=False
if args.render:
    for name,p,t,lens in [('natural_pool_close',(-5.2,1.5,7.2),(-3,.0,3),44),
                          ('natural_pool_garden',(4.2,2.4,13.4),(0,2,-8),31)]:
        bpy.ops.object.camera_add(location=xyz(p));camera=bpy.context.object;camera.name='v18_'+name
        camera.rotation_euler=(Vector(xyz(t))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=lens
        scene.camera=camera;scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)

sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest={
    'version':'V18','derivedFrom':'assets_v16/environment/rain_garden_v16.blend','derivedFromSHA256':sha(SOURCE),
    'coordinates':'glTF Y-up metres; identity transform','waterAnchor':[-3,.025,3],
    'waterBoundary':{'center':[-3,3],'radii':[1.57,1.34],
        'radialFormula':'1+0.083sin(3a+0.4)+0.045cos(5a-0.6)+0.026sin(7a+1.3)'},
    'changes':'V18 derives V16 natural pond; adds a hand-painted linear PBR palette, Blender warm/cool/wet-rim light rig with deterministic keyframes, and runtime-compatible wind metadata. Continuous depressed pebble bed and original garden trees/path retained.',
    'removedObjects':removed,'removedPriorV16':sum(1 for n in removed if n.startswith('v16_')),'shoreStones':48,'submergedPebbles':160,
    'licenses':'Inherited Poly Haven CC0 textures/models; ../../assets_v15/environment/source-licenses-v15.json remains authoritative.',
    'sourceAssetBytesModified':False,'styleProfile':'hand-painted rain garden / physically based wet surfaces', 'wind':{'seed':180713,'mode':'shader-compatible deterministic', 'strength':0.028,'gustPeriodSeconds':9.0}, 'rainLight':{'mode':'key+cool-fill+wet-rim','animated':True}, 'rainbowScale':1.12,'generatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'files':[{'file':p.name,'bytes':p.stat().st_size,'sha256':sha(p)} for p in [glb,blend]],
    'runtimeWater':'WaterPoolV18 exact matching irregular boundary; reflected/refracted visual water, not CFD',
}
(OUT/'provenance-v18.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'glb':str(glb),'bytes':glb.stat().st_size,'blend':str(blend),'rendered':args.render}),flush=True)
