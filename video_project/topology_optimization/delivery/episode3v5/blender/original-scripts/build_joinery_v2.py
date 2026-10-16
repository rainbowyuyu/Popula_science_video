import bpy,math,json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent;O=R.parent/'topology_optimization/public/episode3v2/models';O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene
def mat(n,c):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.43;return m
old=mat('cedar dark',(.38,.18,.073));fresh=mat('cedar light',(.65,.4,.19))
def group(n,parent=None):
 o=bpy.data.objects.new(n,None);sc.collection.objects.link(o);o.parent=parent;return o
def cube(n,loc,dim,m,p):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);o.parent=p;return o
def boolean(a,b):
 bpy.context.view_layer.objects.active=a;m=a.modifiers.new('fitted void','BOOLEAN');m.operation='DIFFERENCE';m.object=b;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(b,do_unlink=True)
def prism(n,points,z0,z1,m,parent):
 vs=[(x,y,z) for z in [z0,z1] for x,y in points];N=len(points);fs=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 me=bpy.data.meshes.new(n);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(n,me);sc.collection.objects.link(o);o.data.materials.append(m);o.parent=parent;return o
def export(root,file):
 bpy.ops.object.select_all(action='DESELECT')
 def visit(o):
  o.select_set(True)
  if o.type=='MESH':
   b=o.modifiers.new('soft tool edge','BEVEL');b.width=.014;b.segments=3
  for c in o.children:visit(c)
 visit(root);bpy.context.view_layer.objects.active=root;bpy.ops.export_scene.gltf(filepath=str(O/file),export_format='GLB',use_selection=True,export_yup=True)
d=group('Dovetail');female=group('fixed',d);male=group('moving',d)
a=cube('female board',(-1,0,1.95),(2,1.55,.55),old,female)
cut=prism('tail socket',[(-.83,-.58),(.04,-.29),(.04,.29),(-.83,.58)],1.63,2.27,old,female);boolean(a,cut)
cube('tail board',(1,0,1.95),(2,1.55,.55),fresh,male)
prism('dovetail',[(-.80,-.55),(0,-.265),(0,.265),(-.80,.55)],1.685,2.215,fresh,male)
export(d,'dovetail.glb');d.location.x=-7
l=group('HalfLap');aG=group('fixed',l);bG=group('moving',l)
a=cube('lap lower',(0,0,1.95),(4,.8,.7),old,aG);cut=cube('upper notch',(0,0,2.145),(.83,1.2,.41),old,aG);boolean(a,cut)
b=cube('lap upper',(0,0,1.95),(.8,4,.7),fresh,bG);cut=cube('lower notch',(0,0,1.755),(1.2,.83,.41),old,bG);boolean(b,cut)
export(l,'half-lap.glb');l.location.x=7
p=group('PeggedTenon');postG=group('fixed',p);beamG=group('moving',p);pinG=group('pin',p)
post=cube('post',(-.6,0,1.8),(1.2,1.25,3.6),old,postG);cut=cube('mortise',(-.6,0,2.25),(1.8,.5,.62),old,postG);boolean(post,cut)
beam=cube('beam',(1.42,0,2.25),(2.84,.9,1),fresh,beamG);tenon=cube('tenon',(-.6,0,2.25),(1.2,.46,.58),fresh,beamG)
def pin(n,r,length,parent):
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=length,location=(-.6,0,2.25),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name=n;o.parent=parent;o.data.materials.append(old);return o
boolean(post,pin('post hole',.093,2,postG));boolean(tenon,pin('tenon hole',.093,2,beamG));pin('wood peg',.083,1.48,pinG)
export(p,'pegged.glb')
# Preserve the pavilion and original straight joint as independent editable scenes.
for filename,offset in [('crafted-pavilion.glb',-17),('crafted-joint.glb',15)]:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(R.parent/'topology_optimization/public/episode3/models'/filename));new=set(bpy.data.objects)-before;root=group('reference_'+filename)
 for o in new:
  if o.parent not in new:o.parent=root
 root.location.x=offset
for root in [d,l,p]:
 moving=next(c for c in root.children if c.name.startswith('moving'));moving.location.z=2;moving.keyframe_insert(data_path='location',frame=1);moving.location.z=0;moving.keyframe_insert(data_path='location',frame=90)
sc.frame_set(100);sc.frame_end=180
bpy.ops.wm.save_as_mainfile(filepath=str(R/'blender/joinery_variants_v2.blend'))
(R/'blender/variants-audit.json').write_text(json.dumps({'types':['straight','dovetail','half lap','pegged tenon'],'booleanVoids':True,'pegHolesThroughBothMembers':True,'teachingGeometry':True},indent=2))
