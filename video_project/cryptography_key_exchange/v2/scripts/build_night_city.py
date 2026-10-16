"""Original midnight-city and cryptography props; glTF Y-up, metre units."""
import bpy, math, json, hashlib, struct, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/night_city.glb'; BLEND=ROOT/'work/models/night_city.blend'; IMAGE=ROOT/'work/models/night_city_preview.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
random.seed(2031)
def v(p):return(p[0],-p[2],p[1])
def mat(name,rgb,metal=0,rough=.4,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.name='Principled BSDF'
 n.inputs['Base Color'].default_value=(*rgb,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Emission Color'].default_value=(*rgb,1);n.inputs['Emission Strength'].default_value=emission
 return m
blue=mat('Cobalt blue glazed brick',(.018,.045,.145),.24,.32)
blue2=mat('Midnight blue stone',(.026,.068,.21),.16,.44)
shadow=mat('Inky charcoal',(.008,.013,.027),.13,.50)
brass=mat('Aged brass soft glints',(.50,.29,.09),.8,.30)
coral=mat('Coral enamel',(.66,.095,.045),.35,.25)
paper=mat('Warm cotton paper',(.92,.79,.55),0,.64)
paperedge=mat('Paper fold shadow',(.56,.36,.15),0,.70)
glass=mat('Ink window glass',(.008,.025,.055),.54,.16)
warm=mat('Warm occupied window',(.95,.46,.10),.05,.30,2.7)
dim=mat('Low amber window',(.32,.16,.065),.06,.38,.50)
wet=mat('Rain-polished basalt',(.035,.049,.085),.30,.20)
stone=mat('Curbstone',(.10,.13,.20),.15,.48)
silver=mat('Engraved pale metal',(.44,.48,.55),.85,.26)
roots=[]
def group(name):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);roots.append(o);return o
def finish(o,name,m,parent):
 o.name=name;o.parent=parent;o.data.materials.append(m)
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=True
 return o
def box(name,p,d,m,parent,r=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object;o.dimensions=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if r:
  b=o.modifiers.new('Soft machined edge','BEVEL');b.width=min(r,min(d)*.44);b.segments=3
  o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
 return finish(o,name,m,parent)
def cyl(name,p,r,h,m,parent,axis='y',vertices=48):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=h,location=v(p));o=bpy.context.object
 if axis=='z':o.rotation_euler.x=math.pi/2
 elif axis=='x':o.rotation_euler.y=math.pi/2
 b=o.modifiers.new('Rounded rim','BEVEL');b.width=min(h*.15,.018);b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return finish(o,name,m,parent)
def tube(name,points,r,m,parent):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=1;c.bevel_depth=r;c.bevel_resolution=3;s=c.splines.new('POLY');s.points.add(len(points)-1)
 for a,p in zip(s.points,points):a.co=(*v(p),1)
 o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);return finish(o,name,m,parent)
def poly(name,points,faces,m,parent):
 me=bpy.data.meshes.new(name);me.from_pydata([v(p) for p in points],[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);return finish(o,name,m,parent)
def ring(name,p,r,thick,m,parent):
 pts=[(p[0]+r*math.cos(i*math.tau/96),p[1]+r*math.sin(i*math.tau/96),p[2]) for i in range(97)]
 return tube(name,pts,thick,m,parent)

city=group('City')
box('Continuous wet street',(0,-.14,0),(40,.28,50),wet,city,.06)
for side in [-1,1]:
 box('Raised stone pavement',(side*7.2,.03,0),(7.2,.20,50),stone,city,.045)
 box('Long curb edge',(side*3.62,.12,0),(.16,.25,50),blue2,city,.035)
# Paving joint detail kept away from the forward camera path.
for z in range(-24,25,2):
 for side in [-1,1]:box('Pavement joint',(side*7.15,.138,z),(6.8,.007,.016),shadow,city,.002)
for side in [-1,1]:
 for j,z in enumerate([-20,-11,-2,8,18]):
  w=7.0+random.random()*1.4;h=[20,17,21,18,13][j]+(1 if side==1 else 0)
  if side==1 and j==1:continue # Recessed hero-window alcove, free of façade overlap.
  x=side*(8.5+w/2)
  box('Townhouse %s %d'%(side,j),(x,h/2+.12,z),(w,h,7.2),blue if j%2 else blue2,city,.11)
  # Façade faces corridor (x), with reveals and bands producing real parallax.
  inner=x-side*w/2
  for level in range(1,int(h/3.2)):
   yy=level*3.15
   box('Stone floor stringcourse',(inner-side*.065,yy,z),(.19,.14,7.4),blue2,city,.025)
   for k in [-1,0,1]:
    zz=z+k*2.08;occupied=random.random()>.56
    box('Inset blue reveal',(inner-side*.038,yy+1.25,zz),(.16,1.74,1.25),shadow,city,.045)
    box('Window glass',(inner-side*.132,yy+1.25,zz),(.035,1.51,1.06),warm if occupied else glass,city,.015)
    box('Window sill',(inner-side*.22,yy+.38,zz),(.52,.13,1.40),blue2,city,.024)
    box('Window mullion',(inner-side*.162,yy+1.25,zz),(.06,1.56,.055),shadow,city,.009)
    box('Window transom',(inner-side*.166,yy+1.27,zz),(.07,.055,1.1),shadow,city,.009)
  box('Roof cornice',(x,h+.13,z),(w+.24,.34,7.50),blue2,city,.05)
  for zz in [-2.2,2.2]:
   box('Roof chimney',(x-side*2,h+.9,z+zz),(.72,1.5,.70),blue,city,.05)
   box('Chimney cap',(x-side*2,h+1.70,z+zz),(.90,.14,.90),brass,city,.025)
# Far building closes the perspective without blocking the middle street.
box('End-of-street silhouette',(0,7.5,-23.5),(15,15,3),blue,city,.10)
for x in [-5,-2,1,4]:
 for y in [3,6.5,10,13]:box('Distant warm window',(x,y,-21.96),(.78,1.45,.035),warm if random.random()>.55 else glass,city,.03)
# Freestanding lamps: true turned posts, globe panes, cornice caps.
for i,(x,z) in enumerate([(-7,3),(3.9,-5),(-3.9,-15),(3.9,15)]):
 cyl('Lamp foot',(x,.22,z),.26,.25,shadow,city)
 cyl('Lamp column',(x,2.15,z),.075,3.7,brass,city)
 box('Lantern warm glass',(x,4.25,z),(.36,.70,.36),warm,city,.035)
 for dx,dz in [(-.22,-.22),(-.22,.22),(.22,-.22),(.22,.22)]:cyl('Lantern frame',(x+dx,4.25,z+dz),.025,.80,shadow,city,vertices=16)
 box('Lantern roof',(x,4.69,z),(.65,.13,.65),brass,city,.05)
 box('Lantern bottom',(x,3.83,z),(.50,.10,.50),shadow,city,.03)
 # Source emitter positions are intentionally named for Three optional fill lights.
 marker=bpy.data.objects.new('LampAnchor_%02d'%i,None);scene.collection.objects.link(marker);marker.parent=city;marker.location=v((x,4.23,z))

post=group('PostBox')
box('PostBox concrete plinth',(0,.13,0),(1.26,.26,1.05),stone,post,.08)
box('PostBox enamel body',(0,1.22,0),(1.06,1.97,.80),coral,post,.15)
box('PostBox raised brass rim',(0,1.88,.414),(.86,.36,.045),brass,post,.06)
box('PostBox slot darkness',(0,1.88,.444),(.72,.17,.015),shadow,post,.036)
box('PostBox slot lip',(0,1.77,.49),(.80,.055,.14),coral,post,.025)
box('PostBox door inset',(0,.94,.416),(.80,1.05,.026),shadow,post,.06)
box('PostBox lower service door',(0,.94,.436),(.75,.99,.025),coral,post,.05)
cyl('PostBox lock',(0,.72,.463),.060,.02,brass,post,'z')
box('PostBox lock slit',(0,.72,.476),(.013,.047,.008),shadow,post,.003)
for x in [-.34,.34]:
 for y in [.52,1.36]:cyl('PostBox rivet',(x,y,.463),.018,.012,brass,post,'z',20)
post.location=v((-5,0,0))

window=group('WindowFrame')
box('Hero masonry inset',(0,0,-.20),(4.1,4.25,.42),blue,window,.12)
box('Hero inner frame',(0,0,.04),(3.51,3.69,.18),brass,window,.07)
box('Hero dark seal',(0,0,.15),(3.25,3.43,.12),shadow,window,.045)
box('Hero warm glass',(0,0,.22),(3.02,3.19,.035),warm,window,.025)
box('Hero window upright',(0,0,.265),(.11,3.20,.09),blue2,window,.02)
box('Hero window horizontal',(0,.10,.265),(3.05,.11,.09),blue2,window,.02)
box('Hero sill',(0,-1.97,.24),(4.25,.23,.80),blue2,window,.055)
for x in [-1.82,1.82]:box('Hero outer pilaster',(x,0,.05),(.21,4.04,.35),blue2,window,.04)
window.location=v((7,8,-10))
# Adjacent wall panel establishes the hero window as architecture, not a floating screen.
box('Delivery facade',(7,8,-10.55),(7.2,16,.62),blue2,city,.09)
for y in [2,4.1,11.2,14.7]:box('Delivery facade horizontal moulding',(7,y,-10.18),(7.6,.12,.18),blue,city,.025)

door=group('DeliveryDoor')
box('Delivery door surround',(0,1.55,-.1),(2.55,3.2,.26),blue,door,.08)
box('Delivery oak door',(0,1.50,.075),(2.14,2.94,.14),shadow,door,.055)
for x in [-.52,.52]:
 for y in [.65,1.72]:box('Delivery raised panel',(x,y,.168),(.82,.78,.045),blue2,door,.045)
box('Door letter plate',(0,2.35,.18),(.78,.18,.06),brass,door,.03)
tube('Door brass handle',[(.75,1.25,.20),(.75,1.25,.38),(.75,1.56,.38),(.75,1.56,.20)],.035,brass,door)
door.location=v((7,0,-10))

env=group('Envelope')
# Original 240mm envelope with layered folded paper and coral wax. Front +Z.
box('Envelope paper body',(0,0,0),(.240,.158,.0048),paper,env,.002)
poly('Envelope back triangular folds',[(-.117,-.075,.003),(.117,-.075,.003),(0,.025,.004),(-.117,.075,.003),(.117,.075,.003)],[(0,1,2),(0,2,3),(1,4,2)],paper,env)
tube('Envelope left fold',[(-.117,-.075,.0037),(0,.025,.0047)],.00045,paperedge,env)
tube('Envelope right fold',[(.117,-.075,.0037),(0,.025,.0047)],.00045,paperedge,env)
flap=poly('Envelope upper flap',[(-.117,.075,.004),(.117,.075,.004),(0,-.031,.006)],[(0,2,1)],paper,env)
solid=flap.modifiers.new('Paper thickness','SOLIDIFY');solid.thickness=.00065
cyl('Envelope coral wax seal',(0,-.027,.007),.017,.0025,coral,env,'z',48)
ring('Wax circular impression',(0,-.027,.0088),.010,.0007,brass,env)
env.location=v((-5,1.87,.65))

wheel=group('CipherWheel')
cyl('CipherWheel base',(0,0,0),1.35,.21,blue2,wheel,'z',96)
cyl('CipherWheel gold face',(0,0,.125),1.24,.055,brass,wheel,'z',96)
cyl('CipherWheel dark inset',(0,0,.161),1.10,.025,shadow,wheel,'z',96)
ring('CipherWheel outer ring',(0,0,.19),1.12,.028,silver,wheel)
ring('CipherWheel inner ring',(0,0,.19),.69,.023,brass,wheel)
for i in range(23):
 a=i*math.tau/23;o=box('CipherWheel tick %02d'%i,(math.sin(a)*1.0,math.cos(a)*1.0,.20),(.035,.17 if i%5==0 else .09,.02),paper,wheel,.007);o.rotation_euler.y=-a
cyl('CipherWheel central spindle',(0,0,.24),.18,.16,brass,wheel,'z')
for i in range(8):
 a=i*math.tau/8;cyl('CipherWheel screw',(1.29*math.sin(a),1.29*math.cos(a),.13),.033,.025,silver,wheel,'z',20)
wheel.location=v((24,2,0))

cert=group('Certificate')
box('Certificate cotton paper',(0,0,0),(2.30,3.05,.018),paper,cert,.009)
for p,d in [((0,1.37,.014),(2.04,.025,.008)),((0,-1.37,.014),(2.04,.025,.008)),((-.99,0,.014),(.025,2.75,.008)),((.99,0,.014),(.025,2.75,.008))]:box('Certificate brass border',p,d,brass,cert,.003)
cyl('Certificate wax medallion',(.59,-.96,.038),.28,.035,coral,cert,'z',64)
ring('Certificate seal edge',(.59,-.96,.060),.20,.025,brass,cert)
cert.location=v((28,2,0))

for o in roots:o['source']='Original procedural Blender geometry';o['unit']='metre'
scene.view_layers[0].update()
meta=[]
for o in roots:
 pts=[]
 for c in o.children_recursive:
  if c.type in {'MESH','CURVE'}:
   for p in c.bound_box:
    q=o.matrix_world.inverted()@c.matrix_world@Vector(p);pts.append((q.x,q.z,-q.y))
 lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
 meta.append({'name':o.name,'translation_xyz_m':[o.location.x,o.location.z,-o.location.y],'bounds_local_min_m':lo,'bounds_local_max_m':hi,'dimensions_m':[hi[i]-lo[i] for i in range(3)]})
bpy.ops.object.select_all(action='DESELECT')
for o in roots:
 o.select_set(True)
 for c in o.children_recursive:c.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_lights=False,export_cameras=False)

def area(name,p,power,size,color,target):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=v(p);o.rotation_euler=(Vector(v(target))-o.location).to_track_quat('-Z','Y').to_euler()
area('Blue moonlight',(0,20,5),4800,14,(.19,.33,1),(0,3,-6))
area('Warm hero window',(7,8,-8.7),1450,3.3,(1,.49,.16),(0,2,0))
area('Warm postbox edge',(-5,5,1.4),650,3,(1,.39,.16),(-5,1.2,0))
area('Silver street reflection',(2,9,12),1200,8,(.44,.58,1),(0,0,0))
scene.world.use_nodes=True
world_background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
world_background.inputs['Color'].default_value=(.003,.007,.025,1)
world_background.inputs['Strength'].default_value=.22
d=bpy.data.cameras.new('Preview');o=bpy.data.objects.new('Preview',d);scene.collection.objects.link(o);o.location=v((-1,5.4,15.5));o.rotation_euler=(Vector(v((1,5.8,-7)))-o.location).to_track_quat('-Z','Y').to_euler();d.lens=28;scene.camera=o
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.filepath=str(IMAGE);scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND));bpy.ops.render.render(write_still=True)
raw=OUT.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);triangles=sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives'])
manifest={'asset':'midnight-cryptography-city','version':2,'source':'Original procedural modelling; scripts/build_night_city.py','tool':'Blender '+bpy.app.version_string,'license':'Original project geometry and materials; no external textures','unit':'metre','coordinateSystem':'glTF Y-up right handed','anchors':{'postBox':[-5,0,0],'postSlot':[-5,1.88,.45],'heroWindow':[7,8,-10],'deliveryDoor':[7,0,-10],'corridor':'x=-3.5..3.5, z=-23..24'},'objects':meta,'triangles':triangles,'glbBytes':OUT.stat().st_size,'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [OUT,BLEND,IMAGE,Path(__file__)]},'preview':str(IMAGE),'limits':'Window emission and wet material are illustrative lighting cues; no live rain/fluids or scanned geometry. CipherWheel and Certificate are library props outside city bounds and should be cloned/repositioned by the caller.'}
(ROOT/'docs/night-city-assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('NIGHT_CITY_READY '+json.dumps({'path':str(OUT),'triangles':triangles,'bytes':OUT.stat().st_size,'roots':[o.name for o in roots]}))
