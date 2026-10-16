import bpy, math, json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent
O=R.parent/'public/episode3v2/models'
O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE'
sc.world=bpy.data.worlds.new('Warm studio');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.76,.65,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.5

def material(name,col,rough=.48):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*col,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=rough;return m
wood=material('aged cedar',(.38,.18,.073));woodlight=material('fresh cedar',(.62,.37,.17));tile=material('ink grey ceramic',(.085,.115,.113));stone=material('limestone',(.59,.57,.49));gold=material('warm brass',(.66,.4,.12),.3)
def group(name,parent=None):
 o=bpy.data.objects.new(name,None);sc.collection.objects.link(o);o.parent=parent;return o
def cube(name,loc,dims,mat,parent,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dims;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);o.parent=parent
 if bevel:
  b=o.modifiers.new('craft eased edge','BEVEL');b.width=bevel;b.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
 return o
def cylinder(name,loc,r,depth,mat,parent):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat);o.parent=parent
 for p in o.data.polygons:p.use_smooth=True
 return o
def rod(name,a,b,r,mat,parent):
 a,b=Vector(a),Vector(b);o=cylinder(name,(a+b)/2,r,(b-a).length,mat,parent);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def select_tree(root):
 bpy.ops.object.select_all(action='DESELECT')
 def walk(o):
  o.select_set(True)
  for c in o.children:walk(c)
 walk(root)
def export(root,file):
 select_tree(root)
 # Collapse material-matched decorative pieces, preserving semantic parent groups.
 bpy.context.view_layer.objects.active=root
 for o in list(bpy.context.selected_objects):
  if o.type=='CURVE':
   bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
 select_tree(root)
 buckets={}
 for o in list(bpy.context.selected_objects):
  if o.type=='MESH':buckets.setdefault((o.parent,o.active_material),[]).append(o)
 for (parent,material),objects in buckets.items():
  if len(objects)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
 select_tree(root);bpy.context.view_layer.objects.active=root;bpy.ops.export_scene.gltf(filepath=str(O/file),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)

pav=group('CraftedPavilion')
base=group('stage_base',pav)
cube('foundation',(0,0,-.25),(7.6,7.6,.36),stone,base,.11)
cube('upper platform',(0,0,-.01),(6.5,6.5,.18),stone,base,.05)
for i in range(2):cube('front step',(0,-3.5-i*.3,-.2-i*.08),(2.5,.6,.18),stone,base,.035)
for i,(x,y) in enumerate([(-2,-2),(2,-2),(-2,2),(2,2)]):
 g=group('stage_column_'+str(i),pav);cylinder('stone plinth',(x,y,.2),.43,.4,stone,g);cylinder('wood column',(x,y,1.85),.20,3.35,wood,g)
 cylinder('column top collar',(x,y,3.25),.24,.14,woodlight,g)
for i in range(4):
 g=group('stage_beam_'+str(i),pav)
 if i<2: loc=(0,(-2 if i==0 else 2),3.25);dims=(4.5,.29,.4)
 else: loc=((-2 if i==2 else 2),0,3.44);dims=(.29,4.5,.4)
 cube('bearing beam',loc,dims,wood,g)
 for j,(x,y) in enumerate([(-2,-2),(2,-2),(-2,2),(2,2)]):
  if j==i:
   for k in range(3):
    cube('corbel layer',(x,y,3.65+k*.14),(.65+k*.22,.22,.16),woodlight,g)
    cube('cross corbel',(x,y,3.7+k*.14),(.22,.68+k*.22,.12),wood,g)
g=group('stage_rafters',pav)
for x in [-1.5,0,1.5]:rod('purlin',(-2.4,x,3.85),(2.4,x,3.85),.095,wood,g)
for x in [i*.3 for i in range(-8,9)]:
 rod('rafter north',(x*.05,0,4.70),(x,2.95,3.50),.052,woodlight,g);rod('rafter south',(x*.05,0,4.70),(x,-2.95,3.50),.052,woodlight,g)
roof=group('stage_roof',pav)
# Four continuous swept roof surfaces, with ceramic roll tile ribs.
for side in range(4):
 verts=[];faces=[];N=20;M=34
 def pt(u,v):
  half=.02+3.18*v; xx=u*half; yy=.04+3.18*v; zz=5.12-1.62*v+.43*v**4+.22*abs(u)**5*v*v
  a=side*math.pi/2;return (xx*math.cos(a)-yy*math.sin(a),xx*math.sin(a)+yy*math.cos(a),zz)
 for j in range(N+1):
  for k in range(M+1):verts.append(pt(-1+2*k/M,j/N))
 for j in range(N):
  for k in range(M):
   a=j*(M+1)+k;faces.append((a,a+1,a+M+2,a+M+1))
 me=bpy.data.meshes.new('curved tiles');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new('roof surface',me);sc.collection.objects.link(ob);ob.parent=roof;ob.data.materials.append(tile)
 sol=ob.modifiers.new('tile thickness','SOLIDIFY');sol.thickness=.045
 for k in range(35):
  u=-1+2*k/34
  cu=bpy.data.curves.new('rolled tile line','CURVE');cu.dimensions='3D';cu.bevel_depth=.039;cu.bevel_resolution=1;sp=cu.splines.new('POLY');sp.points.add(20)
  for j in range(21):a=pt(u,j/20);sp.points[j].co=(*a,1)
  o=bpy.data.objects.new('tile rib',cu);sc.collection.objects.link(o);o.parent=roof;cu.materials.append(tile)
 for u in [-1,1]:
  cu=bpy.data.curves.new('curved eave','CURVE');cu.dimensions='3D';cu.bevel_depth=.09;cu.bevel_resolution=2;sp=cu.splines.new('POLY');sp.points.add(20)
  for j in range(21):sp.points[j].co=(*pt(u,j/20),1)
  o=bpy.data.objects.new('hip ridge',cu);sc.collection.objects.link(o);o.parent=roof;cu.materials.append(tile)
cylinder('ridge finial',(0,0,5.4),.13,.35,gold,roof)
# Decorative low rails leave all structural columns visible.
rails=group('stage_rails',pav)
for yy in [-2,2]:
 for zz in [.65,1.05]:cube('side rail',(0,yy,zz),(3.6,.11,.1),wood,rails)
 for xx in [-1.5,-1,-.5,0,.5,1,1.5]:cube('rail upright',(xx,yy,.83),(.07,.08,.5),wood,rails)
export(pav,'crafted-pavilion.glb')

joint=group('JoineryAssembly');postg=group('mortise',joint)
post=cube('mortise post',(-.6,0,1.8),(1.2,1.25,3.6),wood,postg,.028)
cutter=cube('through mortise cutter',(-.6,0,2.25),(1.8,.49,.61),wood,postg,0)
bpy.context.view_layer.objects.active=post;mod=post.modifiers.new('REAL through mortise','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
beamg=group('tenon',joint)
cube('beam shoulder',(1.42,0,2.25),(2.84,.9,1.0),woodlight,beamg,.025)
cube('rectangular tenon',(-.6,0,2.25),(1.2,.46,.58),woodlight,beamg,.008)
# stored dimensions for viewer and fit audit
joint['mortise_width']=.49;joint['tenon_width']=.46;joint['mortise_height']=.61;joint['tenon_height']=.58;joint['units']='metre schematic; not construction design'
export(joint,'crafted-joint.glb')
# Native Blender assembly animation saved alongside imported Lux3D sources.
for i,o in enumerate(pav.children):
 o.location.z=0;o.keyframe_insert(data_path='location',frame=210)
 o.location.z=(0 if 'base' in o.name else 4+i*.15);o.keyframe_insert(data_path='location',frame=1+i*3)
 o.location.z=0;o.keyframe_insert(data_path='location',frame=65+i*9)
beamg.location.x=2;beamg.keyframe_insert(data_path='location',frame=1);beamg.location.x=0;beamg.keyframe_insert(data_path='location',frame=100)
# Position educational assembly and generated sources side by side in editable project.
joint.location=(10,0,0)
for file,x in [('pavilion_glb.glb',-12),('joint_glb.glb',18)]:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(R/'lux3d'/file));new=set(bpy.data.objects)-before;root=group('LUX3D_SOURCE_'+file)
 for o in new:
  if o.parent not in new:o.parent=root
 root.location.x=x
sc.frame_set(240);sc.frame_end=240
for loc,power,size in [((1,-4,10),1800,7),((-6,-2,6),1200,6),((2,6,8),1900,5)]:
 d=bpy.data.lights.new('softbox','AREA');d.energy=power;d.size=size;o=bpy.data.objects.new('softbox',d);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',d);sc.collection.objects.link(cam);cam.location=(10,-13,9);cam.rotation_euler=(Vector((0,0,2.3))-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=12.5;sc.camera=cam
sc.render.resolution_x=1440;sc.render.resolution_y=1080;sc.render.resolution_percentage=100;sc.render.film_transparent=True
bpy.ops.wm.save_as_mainfile(filepath=str(R/'joinery_pavilion_crafted.blend'))
sc.render.filepath=str(R/'crafted-pavilion.png');bpy.ops.render.render(write_still=True)
(R/'construction-audit.json').write_text(json.dumps({'objects':len(bpy.data.objects),'mortiseVoid':True,'dimensions':dict(joint.items()),'lux3dSourcesImported':True,'modelIsSchematic':True},indent=2))
