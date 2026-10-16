"""Local presentation skins around the native model. Solver files are read-only.

Blender source uses original Z-up metres. glTF export performs its usual Y-up
conversion, matching NativePlatform's [x,z,-y]. Lux3D stays a separate concept
source and is never substituted for the nine native members or twelve lines.
"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/v4'
OUT.mkdir(parents=True, exist_ok=True)
MODEL = ROOT / 'public/beso-research/physics/native-model.json'
data = json.loads(MODEL.read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

def material(name, color, rough=.34, metal=.2):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    return mat

coat = material('Marine ceramic pearl / illustrative skin', (.58,.69,.70), .3,.15)
hull = material('Ceramic teal hull coat', (.045,.18,.22), .3,.24)
dark = material('Graphite joint seals', (.015,.055,.069), .44,.3)
metal = material('Satin aluminium fittings', (.34,.45,.48), .25,.8)
amber = material('Safety markings', (.87,.47,.13), .45,.15)

def cube(name, loc, dims, mat, bevel=.15, collection=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj=bpy.context.object; obj.name=name; obj.dimensions=dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Fabricated edge radius','BEVEL'); mod.width=bevel; mod.segments=4
        bpy.context.view_layer.objects.active=obj; bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons: p.use_smooth=True
    weighted=obj.modifiers.new('Weighted manufacturing normals','WEIGHTED_NORMAL'); weighted.keep_sharp=True
    if collection:
        for c in list(obj.users_collection): c.objects.unlink(obj)
        collection.objects.link(obj)
    obj['presentation_only']=True
    return obj

def cylinder(name,a,b,radius,mat,vertices=64):
    a,b=Vector(a),Vector(b); direction=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=(a+b)/2)
    obj=bpy.context.object; obj.name=name; obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=direction.to_track_quat('Z','Y')
    obj.data.materials.append(mat)
    for p in obj.data.polygons: p.use_smooth=True
    mod=obj.modifiers.new('Welded shoulder radius','BEVEL'); mod.width=.12; mod.segments=3
    return obj

native=bpy.data.collections.new('Native physical skeleton / exact metres'); scene.collection.children.link(native)
endpoint_checks=[]
for e in data['elements']:
    a,b=data['nodes'][str(e['from'])],data['nodes'][str(e['to'])]
    if e.get('diameterM'):
        obj=cylinder('Native %s / %s'%(e['id'],e['role']),a,b,e['diameterM']/2,hull if e['role']=='outer_column' else coat)
    else:
        # Native beam axis is horizontal; keep section height along source Z.
        av,bv=Vector(a),Vector(b); axis=bv-av
        obj=cube('Native %s / radial beam'%e['id'],(av+bv)/2,(axis.length,e['widthM'],e['heightM']),coat,.16)
        obj.rotation_euler.z=math.atan2(axis.y,axis.x)
    obj['native_element_id']=e['id']; obj['role']=e['role']; obj['from_node']=e['from'];obj['to_node']=e['to']
    for c in list(obj.users_collection):c.objects.unlink(obj)
    native.objects.link(obj)
    bpy.context.view_layer.update()
    axis=Vector((0,0,(Vector(b)-Vector(a)).length/2)) if e.get('diameterM') else Vector(((Vector(b)-Vector(a)).length/2,0,0))
    first=obj.matrix_world@(-axis);second=obj.matrix_world@axis
    residual=min(max((first-Vector(a)).length,(second-Vector(b)).length),max((first-Vector(b)).length,(second-Vector(a)).length))
    endpoint_checks.append({'element':e['id'],'axisEndpointResidualM':residual})
    if residual>1e-5:raise RuntimeError('Native element transform mismatch: %s, %s'%(e['id'],residual))

hub=data['hub'];cylinder('Hub native envelope',(0,0,hub['zM']-hub['heightM']/2),(0,0,hub['zM']+hub['heightM']/2),hub['radiusM'],metal)
base=data['tower']['baseZM']; top=base+data['tower']['lengthM']
bpy.ops.mesh.primitive_cone_add(vertices=96,radius1=5.35,radius2=3.1,depth=data['tower']['lengthM'],location=(0,0,(base+top)/2))
tower=bpy.context.object;tower.name='Tower skin around equivalent beam';tower.data.materials.append(coat);tower['presentation_only']=True
for p in tower.data.polygons:p.use_smooth=True

# The exported local nacelle is refined in Blender and loaded on NativePlatform's
# saved tower-tip transform. It never moves or scales solver nodes.
nacelle=bpy.data.collections.new('Nacelle visual skin / tower-top local');scene.collection.children.link(nacelle)
body=cube('Nacelle aerodynamic casing',(7.5,0,1.8),(13.5,5.7,5.35),coat,.72,nacelle)
roof=cube('Raised service fairing',(7.3,0,4.72),(7.1,4.45,.65),coat,.22,nacelle)
cube('Rear cooling screen',(14.26,0,1.65),(.15,4.6,3.75),dark,.05,nacelle)
for i in range(12):
    cube('Cooling louvre %02d'%i,(14.36,0,.15+i*.275),(.12,4.48,.09),metal,.04,nacelle)
for side in [-1,1]:
    cube('Longitudinal panel seam %s'%side,(7.4,side*2.86,1.15),(11,.04,.085),dark,.02,nacelle)
    cube('Access hatch %s'%side,(9.8,side*2.887,.8),(1.9,.05,2.18),coat,.10,nacelle)
    cube('Access hatch handle %s'%side,(10.25,side*2.932,1.15),(.08,.09,.5),metal,.03,nacelle)
cube('Upper section seam',(10.1,0,4.49),(.045,4.4,.03),dark,.015,nacelle)
for y in [-1.8,1.8]:
    for x in [5.1,9.8]:cube('Roof service foot',(x,y,5.25),(.12,.12,.3),metal,.04,nacelle)
    cube('Roof service rail',(7.45,y,5.42),(4.9,.08,.08),metal,.03,nacelle)
cube('Marine safety marking',(1.24,-2.6,.2),(.12,.3,1.8),amber,.04,nacelle)
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=3.0,depth=1.1,location=(0,0,.25))
obj=bpy.context.object;obj.name='Yaw bearing illustrative';obj.data.materials.append(dark)
for c in list(obj.users_collection):c.objects.unlink(obj)
nacelle.objects.link(obj)

bpy.ops.object.select_all(action='DESELECT')
for o in nacelle.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'nacelle-skin.glb'),export_format='GLB',use_selection=True,export_apply=True,export_cameras=False,export_lights=False)
for o in nacelle.objects:o.location.z += top

# Import already-paid Lux3D mesh into a separate hidden reference collection.
# Original file is unmodified; inspect counts/extent for provenance.
lux=ROOT/'public/assets/lux3d.glb'; lux_info={}
if lux.exists():
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(lux))
    added=set(bpy.data.objects)-before
    ref=bpy.data.collections.new('Lux3D concept source / excluded from calculation and render');scene.collection.children.link(ref)
    for o in added:
        for c in list(o.users_collection):c.objects.unlink(o)
        ref.objects.link(o);o.hide_render=True;o.hide_set(True)
    lux_info={'source':str(lux),'sha256':hashlib.sha256(lux.read_bytes()).hexdigest(),'meshObjects':sum(o.type=='MESH' for o in added),'use':'appearance reference only; not solver or native assembly'}

for line in data['mooringPolylines']:
    curve=bpy.data.curves.new('Native mooring %02d'%line['line'],'CURVE');curve.dimensions='3D';curve.bevel_depth=.15;curve.bevel_resolution=2
    poly=curve.splines.new('POLY');poly.points.add(len(line['nativeXYZ'])-1)
    for p,xyz in zip(poly.points,line['nativeXYZ']):p.co=(*xyz,1)
    o=bpy.data.objects.new(curve.name,curve);native.objects.link(o);o.data.materials.append(metal);o['native_line']=line['line']

# Render the local presentation source as an independent modelling proof.
bpy.ops.mesh.primitive_plane_add(size=2400,location=(0,0,-28))
floor=bpy.context.object;floor.name='Preview studio / not ocean solver';floor.data.materials.append(material('Soft background',(.69,.79,.80),.78,0))
world=bpy.data.worlds.new('Soft photographic sky');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.78,.83,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;scene.world=world
for name,loc,power,size in [('Key',(80,-100,170),260000,90),('Cool rim',(-90,70,180),300000,80),('Soft fill',(-100,-80,80),85000,70)]:
    bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.name=name;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,35))-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(143,-178,131));cam=bpy.context.object;cam.name='Native float assembly proof';cam.rotation_euler=(Vector((0,0,-1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=53;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1280;scene.render.resolution_y=1280;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'native-assembly-proof.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'native-presentation-source.blend'))
tower.hide_render=True
for o in nacelle.objects:o.hide_render=True
bpy.ops.render.render(write_still=True)
record={'schema':'ai-engineer-v4-local-blender-v1','blenderVersion':bpy.app.version_string,'nativeModelSHA256':hashlib.sha256(MODEL.read_bytes()).hexdigest(),'nativeMemberCount':len(data['elements']),'nativeMooringCount':len(data['mooringPolylines']),'nacelleMeshCount':len(nacelle.objects),'endpointChecks':endpoint_checks,'maximumEndpointResidualM':max(x['axisEndpointResidualM'] for x in endpoint_checks),'lux3d':lux_info,'nativeSourceChanged':False,'outputs':['nacelle-skin.glb','native-presentation-source.blend','native-assembly-proof.png'],'boundary':'Native dimensions preserved. Nacelle, welds, coating and tower shell are presentation skins; preview is not a fresh physical simulation.'}
(OUT/'blender-provenance.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print(json.dumps(record))
