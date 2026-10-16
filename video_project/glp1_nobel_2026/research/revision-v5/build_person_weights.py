import bpy, json, struct
from pathlib import Path
root=Path(__file__).resolve().parents[2]
b=(root/'public/models/body.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=b[28+n:]
def accessor(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];fmt={5126:'f',5125:'I',5123:'H'}[a['componentType']];size={'SCALAR':1,'VEC3':3}[a['type']];return struct.unpack_from('<'+fmt*a['count']*size,binary,v.get('byteOffset',0)+a.get('byteOffset',0))
primitive=g['meshes'][0]['primitives'][0];p=accessor(primitive['attributes']['POSITION']);idx=accessor(primitive['indices']);verts=[(p[i],-p[i+2],p[i+1]) for i in range(0,len(p),3)];faces=[idx[i:i+3] for i in range(0,len(idx),3)]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mesh=bpy.data.meshes.new('atlas-body');mesh.from_pydata(verts,[],faces);mesh.update();body=bpy.data.objects.new('atlas-body',mesh);bpy.context.collection.objects.link(body)
bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='landmark-teaching-rig';bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0]);bones={}
def cv(v):return (v[0],-v[2],v[1])
def bone(name,a,b,parent=None):
 o=rig.data.edit_bones.new(name);o.head=cv(a);o.tail=cv(b);bones[name]=o
 if parent:o.parent=bones[parent]
bone('pelvis',(0,.85,-.02),(0,1.00,-.02));bone('spine',(0,1.00,-.02),(0,1.27,-.03),'pelvis');bone('chest',(0,1.27,-.03),(0,1.44,-.04),'spine');bone('head',(0,1.44,-.04),(0,1.69,-.02),'chest')
for side,tag in [(1,'L'),(-1,'R')]:
 bone('clavicle'+tag,(0,1.403,-.04),(side*.174,1.403,-.04),'chest')
 bone('upper'+tag,(side*.174,1.403,-.04),(side*.225,1.108,-.036),'clavicle'+tag)
 bone('forearm'+tag,(side*.225,1.108,-.036),(side*.250,.911,.008),'upper'+tag)
 bone('hand'+tag,(side*.250,.911,.008),(side*.273,.807,.050),'forearm'+tag)
 bone('thigh'+tag,(side*.086,.90,-.018),(side*.089,.48,.015),'pelvis')
 bone('shin'+tag,(side*.089,.48,.015),(side*.09,.085,.019),'thigh'+tag)
 bone('foot'+tag,(side*.09,.085,.019),(side*.10,.024,.128),'shin'+tag)
bpy.ops.object.mode_set(mode='OBJECT');
# Bone heat on a welded, enlarged calculation copy avoids tiny disconnected seams.
bpy.context.view_layer.objects.active=body;body.select_set(True);rig.select_set(False);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00002);bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');body.scale=(100,100,100);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);rig.scale=(100,100,100);bpy.context.view_layer.objects.active=rig;body.select_set(False);rig.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.parent_set(type='ARMATURE_AUTO')
names=[v.name for v in body.vertex_groups];weights=[]
from mathutils.kdtree import KDTree
kd=KDTree(len(body.data.vertices))
for v in body.data.vertices:kd.insert(v.co,v.index)
kd.balance()
for source in verts:
 _,vi,_=kd.find(tuple(x*100 for x in source));v=body.data.vertices[vi]
 row={names[w.group]:round(w.weight,6) for w in v.groups if w.weight>1e-5};weights.append(row)
path=root/'research/revision-v5/person-blender-raw-weights.json';path.write_text(json.dumps({'source':'Blender automatic bone-heat weights; BodyParts3D teaching rig','vertices':len(verts),'weights':weights},separators=(',',':')))
bpy.ops.wm.save_as_mainfile(filepath=str(root/'research/revision-v5/person-teaching-rig.blend'))
print('WEIGHTS',len(weights),len([w for w in weights if w]),names)
# Separate smooth garment volume; no projected skin triangles or duplicate
# genital faces are carried into the visible cloth surface.
import bmesh
bpy.ops.object.select_all(action='DESELECT')
parts=[]
def ellipsoid(name,center,scale):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,location=cv(center));o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);parts.append(o)
ellipsoid('hip cloth',(0,.924,-.018),(.202,.184,.145))
for side in [-1,1]:ellipsoid('leg cloth',(side*.092,.762,-.016),(.109,.170,.119))
for o in bpy.context.selected_objects:o.select_set(False)
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();shorts=bpy.context.object
mod=shorts.modifiers.new('Unified smooth cloth','REMESH');mod.mode='VOXEL';mod.voxel_size=.0045;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
mod=shorts.modifiers.new('Soft cloth','SMOOTH');mod.factor=.65;mod.iterations=5;bpy.ops.object.modifier_apply(modifier=mod.name)
# A narrow rounded crotch opening keeps the two shorts legs independent.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.016,.669));cutter=bpy.context.object;cutter.scale=(.032,.8,.205);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
mod=cutter.modifiers.new('Rounded crotch','BEVEL');mod.width=.015;mod.segments=5;bpy.context.view_layer.objects.active=cutter;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active=shorts;mod=shorts.modifiers.new('Two leg openings','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;mod.solver='EXACT';bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
# Apply world transform before plane clipping and export.
bpy.ops.object.select_all(action='DESELECT');shorts.select_set(True);bpy.context.view_layer.objects.active=shorts
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new();bm.from_mesh(shorts.data)
for height,normal in [(1.002,(0,0,1)),(.680,(0,0,-1))]:
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,0,height),plane_no=normal,clear_outer=True,clear_inner=False)
bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(shorts.data);bm.free();shorts.data.update()
garment={'source':'Blender voxel-unified and smoothed garment; metres','position':[[v.co.x,v.co.z,-v.co.y] for v in shorts.data.vertices],'index':[i for p in shorts.data.polygons for i in p.vertices]}
(root/'src/V5Garment.json').write_text(json.dumps(garment,separators=(',',':')))
print('GARMENT',len(garment['position']),len(garment['index'])//3)
