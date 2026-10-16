"""Native-dimension connected fabrication shell; Blender presentation, not solver."""
import bpy, bmesh, json, math, hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/v16'; OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'public/beso-research/physics/native-model.json'
data=json.loads(SOURCE.read_text()); pivot=Vector(data['nodes']['1'])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'

def mat(name,c,rough=.4,metal=.1):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
pearl=mat('Pearl marine coating',(.64,.73,.71),.39,.12)
teal=mat('Submerged teal marine coating',(.035,.16,.19),.34,.22)
metal=mat('Satin titanium hardware',(.26,.37,.39),.3,.68)
graphite=mat('Recessed joint trim',(.017,.046,.057),.45,.12)

def cyl(name,a,b,r,material):
 a,b=Vector(a),Vector(b);d=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=d.length,location=(a+b)*.5)
 o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');o.data.materials.append(material)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 return o

def box(name,c,d,material,bevel=.08):
 bpy.ops.mesh.primitive_cube_add(size=1,location=c);o=bpy.context.object;o.name=name;o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:
  m=o.modifiers.new('Machined edge','BEVEL');m.width=bevel;m.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 return o

parts=[];checks=[]
for e in data['elements']:
 a=Vector(data['nodes'][str(e['from'])])-pivot;b=Vector(data['nodes'][str(e['to'])])-pivot;d=b-a
 if e.get('diameterM'):
  extension=e['diameterM']*.20 if e['role']=='outer_column' else .08
  o=cyl('Native member %s %s'%(e['id'],e['role']),a,b+d.normalized()*extension,e['diameterM']/2,pearl)
 else:
  o=box('Native radial beam %s'%e['id'],(a+b)*.5,(d.length,e['widthM'],e['heightM']),pearl,0)
  o.rotation_euler.z=math.atan2(d.y,d.x);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 o['native_element']=e['id'];o['role']=e['role'];o['from_node']=e['from'];o['to_node']=e['to'];o['native_axis_length_m']=d.length
 parts.append(o);checks.append({'element':e['id'],'sourceA':list(a+pivot),'sourceB':list(b+pivot),'sourceLengthM':d.length,'axisChanged':False})
# The native equivalent hub is shallow; a compact welded receiver closes the
# continuous brace intersections without pretending to be detailed solver CAD.
hub=cyl('Native hub with illustrative connection sleeve',(0,0,-5.45),(0,0,5.45),14.2,pearl)
hub['presentation_sleeve']=True
for o in parts:
 bpy.context.view_layer.objects.active=hub
 mod=hub.modifiers.new('Watertight union '+o.name,'BOOLEAN');mod.operation='UNION';mod.solver='EXACT';mod.object=o
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(o,do_unlink=True)
hub.name='Native connected fabricated hull / source axes unchanged'
# Close duplicate vertices and validate the actual output mesh.
bm=bmesh.new();bm.from_mesh(hub.data);bmesh.ops.remove_doubles(bm,verts=bm.verts[:],dist=1e-5);bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(hub.data);bm.free()
hub.data.materials.clear();hub.data.materials.append(pearl);hub.data.materials.append(teal)
for p in hub.data.polygons:
 p.material_index=1 if p.center.z < -10.8 else 0;p.use_smooth=True
bevel=hub.modifiers.new('Fabrication seam highlight','BEVEL');bevel.width=.085;bevel.segments=3;bevel.limit_method='ANGLE';bevel.angle_limit=.52
bpy.context.view_layer.objects.active=hub;bpy.ops.object.modifier_apply(modifier=bevel.name)
normal=hub.modifiers.new('Weighted planar normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=30;bpy.ops.object.modifier_apply(modifier=normal.name)
# Do not duplicate the skin. All deck fittings belong to one rigid parent.
deck=[]
for angle in [math.pi/3,math.pi,5*math.pi/3]:
 for r in [7.0,10.8]:
  o=box('Flush inspection hatch',(r*math.cos(angle),r*math.sin(angle),5.5),(2.4,1.7,.09),metal,.06);o.rotation_euler.z=angle;deck.append(o)
for i in range(24):
 a=i/24*math.tau
 o=cyl('Tower foundation fastener %02d'%i,(5.62*math.cos(a),5.62*math.sin(a),5.45),(5.62*math.cos(a),5.62*math.sin(a),5.58),.105,metal);deck.append(o)
# Mooring source fairleads sit slightly above the inclined end plates. A local
# welded cradle connects each exact fairlead point to its column, without moving
# the solver endpoint to cosmetically fit the skin.
outers=[e for e in data['elements'] if e['role']=='outer_column']
for line in data['mooringPolylines']:
 fair=Vector(line['nativeXYZ'][-1])-pivot
 e=min(outers,key=lambda e:(Vector(data['nodes'][str(e['from'])])-pivot-fair).length)
 a=Vector(data['nodes'][str(e['from'])])-pivot;b=Vector(data['nodes'][str(e['to'])])-pivot;axis=(b-a).normalized()
 foot=fair-axis*(fair-a).dot(axis)+axis*.22
 o=cyl('Fairlead support cradle %02d'%line['line'],foot,fair,.30,metal);o['source_line']=line['line'];o['presentation_only']=True;deck.append(o)
# Hull child coordinates use node 1 as pivot; GLB Z-up conversion yields x,z,-y.
bpy.ops.object.select_all(action='DESELECT');hub.select_set(True)
for o in deck:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'connected-native-hull.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
# A local nacelle shell improves visible rear/side views at the final pullout.
bpy.ops.object.select_all(action='DESELECT')
nacelle=[]
for spec in [('Aerodynamic nacelle',(7.6,0,1.7),(13.8,5.6,5.4),pearl,.7),('Service roof',(7.2,0,4.58),(7.4,4.35,.65),pearl,.18),('Cooling inset',(14.57,0,1.55),(.08,4.65,3.4),graphite,.03)]:nacelle.append(box(*spec))
for i in range(10):nacelle.append(box('Vent %02d'%i,(14.64,0,.25+i*.28),(.07,4.5,.055),metal,.02))
for o in nacelle:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'nacelle-skin.glb'),export_format='GLB',use_selection=True,export_apply=True)
for o in nacelle:o.hide_render=True;o.hide_set(True)
# Actual connectivity/finite coordinate report before saving.
adj={i:set() for i in range(len(hub.data.vertices))}
for e in hub.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
remaining=set(adj);components=[]
while remaining:
 stack=[remaining.pop()];count=0
 while stack:
  a=stack.pop();count+=1
  for b in adj[a]:
   if b in remaining:remaining.remove(b);stack.append(b)
 components.append(count)
coords=[tuple(v.co) for v in hub.data.vertices]
report={'schema':'native-fabrication-v16','blenderVersion':bpy.app.version_string,'nativeModelSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'nativeMemberCount':len(checks),'nativeMooringCount':len(data['mooringPolylines']),'nativeSourceChanged':False,'sourceAxisChecks':checks,'hullComponents':components,'hullVertexCount':len(coords),'allFinite':all(math.isfinite(c) for p in coords for c in p),'connectedHull':len(components)==1,'waterPlaneLocalZ':-12,'visibleOuterColumnBottomExtension':'0.20 diameter, local fabrication joint bay only','nativeAxisTransform':'source [x,y,z] -> local Blender [x,y,z-12] -> glTF [x,z-12,-y]','boundary':'Visual fabrication envelope. Nine native axes, source dimensions and saved response unchanged; presentation receiver sleeve and chamfer are not solver members.'}
if not report['allFinite'] or not report['connectedHull']:raise RuntimeError(json.dumps(report))
(OUT/'blender-geometry-contact-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
scene['boundary']=report['boundary'];bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'native-fabrication-source.blend'))
print(json.dumps(report))
