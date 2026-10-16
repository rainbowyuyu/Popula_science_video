"""Original V15 pearl rainbow-fish: continuous skin, twenty-bone weighted rig.

No downloaded mesh or texture. Author coordinates are Y-up, +Z forward.
The optical marker is the midpoint of the actual front lens poles, not body centre.
"""
import argparse, json, math, hashlib
from pathlib import Path
import bpy
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--asset-dir',required=True)
parser.add_argument('--review-dir',required=True)
args=parser.parse_args(__import__('sys').argv[__import__('sys').argv.index('--')+1:])
ASSET=Path(args.asset_dir).resolve();REVIEW=Path(args.review_dir).resolve()
ASSET.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def P(v):return Vector((v[0]*1.08,-v[2]*.75,1.37+(v[1]-1.37)*1.13))
def mix(a,b,t):return tuple(a[i]*(1-t)+b[i]*t for i in range(len(a)))
def clamp(x):return max(0,min(1,x))
def smooth(x):x=clamp(x);return x*x*(3-2*x)
# Colors below are linear RGB, intentionally more subdued than rainbow stripes.
PEARL=(.90,.94,.86);AQUA=(.025,.48,.39);CORAL=(.93,.37,.28);LAVENDER=(.53,.34,.66)
def material(name,color,rough=.3,metal=.03,coat=.4,paint=False):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if n is None:
  m.node_tree.nodes.clear();n=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(n.outputs['BSDF'],out.inputs['Surface'])
 n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 n.inputs['Coat Weight'].default_value=coat;n.inputs['Coat Roughness'].default_value=.25
 if paint:
  c=m.node_tree.nodes.new('ShaderNodeVertexColor');c.layer_name='Color';m.node_tree.links.new(c.outputs['Color'],n.inputs['Base Color'])
 return m
pearl=material('V15 Pearl ceramic skin',PEARL,.29,.045,.48,True)
finmat=material('V15 Satin silk fins',AQUA,.33,.025,.32,True)
ivory=material('V15 Warm eye porcelain',(.95,.96,.90),.23,0,.54)
iris=material('V15 Deep teal iris',(.035,.25,.27),.23,.025,.58)
ink=material('V15 Velvet pupil',(.006,.025,.032),.16,0,.78)
light=material('V15 Eye catchlight',(.99,1,1),.11,0,.72)
lip=material('V15 Gentle mouth',(.27,.39,.35),.35,0,.24)
blush=material('V15 Peach cheek',(.87,.46,.36),.42,0,.18)
vein=material('V15 Fin pearlescent ribs',(.43,.71,.65),.4,0,.22)
bones={
 'Root':((0,1.37,0),None),'Head':((0,1.43,.34),'Root'),'Jaw':((0,1.26,.61),'Head'),
 'Spine0':((0,1.37,.04),'Root'),'Spine1':((0,1.36,-.28),'Spine0'),'Spine2':((0,1.35,-.61),'Spine1'),
 'Tail0':((0,1.34,-.91),'Spine2'),'Tail1':((0,1.34,-1.12),'Tail0'),
 'Tail2':((0,1.34,-1.38),'Tail1'),'Tail3':((0,1.34,-1.61),'Tail2'),
 'PectoralL0':((-.37,1.32,.12),'Root'),'PectoralL1':((-.60,1.28,-.12),'PectoralL0'),
 'PectoralR0':((.37,1.32,.12),'Root'),'PectoralR1':((.60,1.28,-.12),'PectoralR0'),
 'Dorsal':((0,1.72,-.25),'Spine0'),
 'PelvicL0':((-.16,1.03,-.33),'Spine1'),'PelvicL1':((-.25,.93,-.54),'PelvicL0'),
 'PelvicR0':((.16,1.03,-.33),'Spine1'),'PelvicR1':((.25,.93,-.54),'PelvicR0'),
 'Anal':((0,1.02,-.64),'Spine2')}
armdata=bpy.data.armatures.new('RainbowFishSkeletonV15');arm=bpy.data.objects.new('RainbowFishRigV15',armdata)
bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(head,parent) in bones.items():
 b=armdata.edit_bones.new(name);b.head=P(head);b.tail=P((head[0],head[1]+.14,head[2]))
 if parent:b.parent=armdata.edit_bones[parent]
 b.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT');arm.show_in_front=True;meshes=[]
def mesh(name,vs,fs,ws,cs,mat):
 data=bpy.data.meshes.new(name);data.from_pydata([P(v) for v in vs],[],fs);data.update()
 obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);data.materials.append(mat)
 for p in data.polygons:p.use_smooth=True
 if cs:
  attr=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  for i,c in enumerate(cs):attr.data[i].color=(*c,1)
 groups={n:obj.vertex_groups.new(name=n) for n in bones}
 for i,w in enumerate(ws):
  total=sum(w.values())
  for bone,value in w.items():
   if value>1e-7:groups[bone].add([i],value/total,'REPLACE')
 mod=obj.modifiers.new('V15 Weighted continuous anatomy','ARMATURE');mod.object=arm
 obj.parent=arm;meshes.append(obj);return obj
centres=[(-1.02,'Tail0'),(-.69,'Spine2'),(-.36,'Spine1'),(.035,'Spine0'),(.44,'Head')]
def bodyweight(z):
 if z<=centres[0][0]:return {centres[0][1]:1}
 if z>=centres[-1][0]:return {centres[-1][1]:1}
 for (a,ba),(b,bb) in zip(centres,centres[1:]):
  if a<=z<=b:
   t=smooth((z-a)/(b-a));return {ba:1-t,bb:t}
# Rounded torso with a full, friendly forehead and a tapered real peduncle.
vs=[];fs=[];ws=[];cs=[];NR=68;NS=88
for j in range(NR+1):
 t=j/NR;z=-1.10+1.91*t;bulb=math.sin(math.pi*t)**.57
 rx=.035+.414*bulb*(.59+.41*t);ry=.040+.415*bulb
 cy=1.34+.095*smooth(t)
 if j in (0,NR):rx=.024 if j==0 else .032;ry=.027 if j==0 else .042
 for k in range(NS):
  a=2*math.pi*k/NS;x=rx*math.cos(a);y=cy+ry*math.sin(a)
  vs.append((x,y,z));ws.append(bodyweight(z))
  dorsal=smooth((math.sin(a)+.38)/1.15)
  # Aqua dorsal cape/pearl belly rather than disjoint rainbow paint bars.
  c=mix(PEARL,AQUA,dorsal*.93)
  flank=math.exp(-((math.sin(a)-.08)/.33)**2)
  tail_lavender=math.exp(-((t-.26)/.23)**2)*flank*.22
  cheek_coral=math.exp(-((t-.77)/.17)**2)*flank*.15
  c=mix(c,LAVENDER,tail_lavender);c=mix(c,CORAL,cheek_coral)
  # Restrained pearlescence follows the anatomy, not a random speckled texture.
  sheen=.035*math.sin(9*math.pi*t+2*math.cos(a))*flank
  cs.append(tuple(clamp(v+sheen) for v in c))
for j in range(NR):
 for k in range(NS):
  n=(k+1)%NS;fs.append((j*NS+k,j*NS+n,(j+1)*NS+n,(j+1)*NS+k))
fs.append(tuple(reversed(tuple(range(NS)))));fs.append(tuple(NR*NS+k for k in range(NS)))
mesh('ContinuousPearlBody',vs,fs,ws,cs,pearl)
def ellipsoid(name,center,radii,mat,bone='Head',rows=24,cols=40):
 vs=[];fs=[]
 for j in range(rows+1):
  phi=math.pi*j/rows
  for k in range(cols):
   a=2*math.pi*k/cols
   vs.append((center[0]+radii[0]*math.sin(phi)*math.cos(a),center[1]+radii[1]*math.cos(phi),center[2]+radii[2]*math.sin(phi)*math.sin(a)))
 for j in range(rows):
  for k in range(cols):fs.append((j*cols+k,j*cols+(k+1)%cols,(j+1)*cols+(k+1)%cols,(j+1)*cols+k))
 painted=mat in (pearl,finmat)
 return mesh(name,vs,fs,[{bone:1} for _ in vs],[tuple(mat.diffuse_color[:3]) for _ in vs] if painted else None,mat)
for side,sgn in [('L',-1),('R',1)]:
 # Socket sits inside the head; porcelain is visible without floating eyeballs.
 ellipsoid('V15 EyeWhite'+side,(sgn*.218,1.55,.655),(.145,.150,.055),pearl)
 ellipsoid('V15 IrisRing'+side,(sgn*.218,1.55,.699),(.121,.132,.025),iris)
 ellipsoid('EyeIris'+side,(sgn*.218,1.55,.710),(.111,.121,.025),ink)
 ellipsoid('V15 Catchlight'+side,(sgn*.218-.027,1.594,.740),(.022,.026,.010),light,rows=12,cols=20)
 ellipsoid('V15 CatchlightSmall'+side,(sgn*.218+.023,1.527,.740),(.009,.010,.007),light,rows=10,cols=16)
 ellipsoid('V15 PeachCheek'+side,(sgn*.259,1.368,.596),(.069,.026,.019),blush,rows=16,cols=28)
# A small smile on the real muzzle, with soft corners and no teeth.
vs=[];fs=[]
for j in range(41):
 t=j/40;x=-.115+.230*t;y=1.273-.023*math.sin(math.pi*t);z=.804-.052*(2*t-1)**2
 for k in range(12):
  a=2*math.pi*k/12;vs.append((x,y+.0065*math.cos(a),z+.0065*math.sin(a)))
for j in range(40):
 for k in range(12):fs.append((j*12+k,j*12+(k+1)%12,(j+1)*12+(k+1)%12,(j+1)*12+k))
mesh('V15 GentleSmile',vs,fs,[{'Jaw':1} for _ in vs],None,lip)
def tail_weights(z):
 stops=[(-1.02,'Tail0'),(-1.25,'Tail1'),(-1.51,'Tail2'),(-1.82,'Tail3')]
 if z>=stops[0][0]:return {stops[0][1]:1}
 if z<=stops[-1][0]:return {stops[-1][1]:1}
 for (a,ba),(b,bb) in zip(stops,stops[1:]):
  if b<=z<=a:
   t=smooth((a-z)/(a-b));return {ba:1-t,bb:t}
def membrane(name,origin,edge,bone0,bone1=None,mode='fan',palette=(AQUA,LAVENDER),ribs=False):
 vs=[];ws=[];cs=[];fs=[];R=20;C=44
 for layer in [-1,1]:
  for r in range(R+1):
   u=r/R
   for k in range(C+1):
    t=k/C;v=list(mix(origin,edge(t),u))
    # Gentle curvature/thickness removes paper-triangle silhouette.
    ridge=.009*math.sin(math.pi*u)*math.cos(10*math.pi*t)
    axis=0 if mode=='tail' else 1
    v[axis]+=layer*(.005+.006*math.sin(math.pi*u))+ridge
    if mode!='tail':v[2]+=.030*math.sin(math.pi*u)*math.sin(math.pi*t)
    vs.append(tuple(v));tip=smooth((u-.12)/.88)
    ws.append(tail_weights(v[2]) if name=='V15 CaudalFan' else ({bone0:1-tip,bone1:tip} if bone1 else {bone0:1}))
    c=mix(palette[0],palette[1],smooth(t))
    c=mix(c,PEARL,smooth((u-.80)/.20)*.53)
    # Subtle radial fin rays are part of painted weighted skin.
    ray=(.5+.5*math.cos(10*math.pi*t))**18*.055*math.sin(math.pi*u)
    cs.append(tuple(clamp(v+ray) for v in c))
 count=(R+1)*(C+1)
 for layer in range(2):
  for r in range(R):
   for k in range(C):
    a=layer*count+r*(C+1)+k;b=a+1;d=a+C+1;c=d+1
    fs.append((a,b,c,d) if layer==0 else (d,c,b,a))
 for k in range(C):
  a=R*(C+1)+k;fs.append((a,a+1,a+1+count,a+count))
 for r in range(R):
  a=r*(C+1);b=(r+1)*(C+1);fs.append((a,b,b+count,a+count))
  a=r*(C+1)+C;b=(r+1)*(C+1)+C;fs.append((b,a,a+count,b+count))
 return mesh(name,vs,fs,ws,cs,finmat)
def tail_edge(t):
 u=2*t-1;y=1.34+.535*math.sin(math.pi*u/2)
 # Rounded outer lobes and forward swept tips give a soft heart-fan contour.
 depth=1.58+.34*math.sin(math.pi*abs(u))**.8-.11*abs(u)**4
 return (0,y,-depth)
membrane('V15 CaudalFan',(0,1.34,-1.03),tail_edge,'Tail1','Tail3','tail',(LAVENDER,CORAL))
ellipsoid('V15 CaudalPeduncle',(0,1.34,-1.055),(.074,.091,.175),pearl,'Tail0')
for side,sgn in [('L',-1),('R',1)]:
 def pec_edge(t,s=sgn):
  a=math.pi*t;return (s*(.385+.40*math.sin(a)**.80),1.31-.11*math.sin(a),.16-.59*t)
 membrane('V15 PectoralSilk'+side,(sgn*.365,1.32,.12),pec_edge,'Pectoral'+side+'0','Pectoral'+side+'1',palette=(AQUA,CORAL))
 def pel_edge(t,s=sgn):return (s*(.17+.17*math.sin(math.pi*t)),1.015-.14*math.sin(math.pi*t),-.25-.39*t)
 membrane('V15 PelvicSilk'+side,(sgn*.16,1.03,-.33),pel_edge,'Pelvic'+side+'0','Pelvic'+side+'1',palette=(AQUA,LAVENDER))
def dorsal_edge(t):return (0,1.73+.24*math.sin(math.pi*t)**.75,.08-.87*t)
membrane('V15 DorsalSail',(0,1.72,-.25),dorsal_edge,'Dorsal',mode='tail',palette=(AQUA,LAVENDER))
def anal_edge(t):return (0,1.02-.15*math.sin(math.pi*t),-.49-.32*t)
membrane('V15 AnalSail',(0,1.02,-.64),anal_edge,'Anal',mode='tail',palette=(AQUA,CORAL))
def marker(name,position,bone=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.empty_display_type='SPHERE';o.empty_display_size=.04;o.location=P(position)
 if bone:
  o.parent=arm;o.parent_type='BONE';o.parent_bone=bone;bpy.context.view_layer.update();o.matrix_world.translation=P(position)
 return o
marker('EyeReference',(0,1.55,.735),'Head');marker('HoverReference',(0,.85,0))
# Complete skin cycle is reusable in Blender; runtime poses are pure frame functions.
arm.animation_data_create();action=bpy.data.actions.new('PearlSwimCycleV15');arm.animation_data.action=action
for frame in range(1,121,4):
 phase=2*math.pi*(frame-1)/120
 for j,name in enumerate(['Spine0','Spine1','Spine2','Tail0','Tail1','Tail2','Tail3']):
  b=arm.pose.bones[name];b.rotation_mode='XYZ';b.rotation_euler=(0,(.004+j*.008)*math.sin(phase-j*.47),0);b.keyframe_insert(data_path='rotation_euler',frame=frame)
 for side,sgn in [('L',-1),('R',1)]:
  for tip in [0,1]:
   b=arm.pose.bones['Pectoral'+side+str(tip)];b.rotation_mode='XYZ';b.rotation_euler=(.012*math.sin(phase+.35),0,sgn*(.035+tip*.012)*math.sin(phase));b.keyframe_insert(data_path='rotation_euler',frame=frame)
arm.animation_data.action=None
for b in arm.pose.bones:b.rotation_euler=(0,0,0)
scene=bpy.context.scene;scene.frame_set(1);scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=825;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True;bg=next((n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'),None)
if bg is None:
 scene.world.node_tree.nodes.clear();bg=scene.world.node_tree.nodes.new('ShaderNodeBackground');out=scene.world.node_tree.nodes.new('ShaderNodeOutputWorld');scene.world.node_tree.links.new(bg.outputs['Background'],out.inputs['Surface'])
bg.inputs['Color'].default_value=(.71,.79,.78,1);bg.inputs['Strength'].default_value=.50
scene.view_settings.view_transform='AgX'
floor=material('V15 Review gallery',(.76,.80,.76),.65,0,0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.04));plane=bpy.context.object;plane.name='ReviewFloor';plane.data.materials.append(floor)
def area(name,location,power,size,color):
 bpy.ops.object.light_add(type='AREA',location=P(location));o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color
 o.rotation_euler=(P((0,1.40,-.25))-o.location).to_track_quat('-Z','Y').to_euler()
area('Pearl key',(-3,5,4),650,4,(1,.96,.86));area('Aqua fill',(4,3,1),320,4,(.79,.96,1));area('Silk rim',(0,4,-4),700,3,(.88,.92,1))
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='ReviewCamera';scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=3.85
for o in bpy.context.selected_objects:o.select_set(False)
arm.select_set(True)
for o in meshes:o.select_set(True)
for n in ['EyeReference','HoverReference']:bpy.data.objects[n].select_set(True)
bpy.context.view_layer.objects.active=arm
glb=ASSET/'rainbow_fish_v15.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_skins=True,export_all_influences=False,export_apply=False)
views={'front-threequarter':(3.7,2.65,4.7),'side':(5.2,2.2,.1),'front':(.0,1.85,5.2),'back-threequarter':(-3.8,2.65,-4.5)}
for name,pos in views.items():
 camera.location=P(pos);camera.rotation_euler=(P((0,1.40,-.37))-camera.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)
arm.animation_data.action=action;scene.frame_start=1;scene.frame_end=120;scene.render.fps=30;scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'rainbow-fish-source-v15.blend'))
allvs=[v for o in meshes for v in o.data.vertices]
bbox={'min':[min(v.co[i] for v in allvs) for i in range(3)],'max':[max(v.co[i] for v in allvs) for i in range(3)]}
stat={'version':'V15','boneCount':len(bones),'meshCount':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),
 'multiboneVertices':sum(1 for o in meshes for v in o.data.vertices if len([g for g in v.groups if g.weight>1e-5])>1),
 'glbSHA256':hashlib.sha256(glb.read_bytes()).hexdigest(),'eyeAuthored':[0,1.37+(1.55-1.37)*1.13,.735*.75],
 'glTFUp':'Y','glTFForward':'+Z','clipInBlend':'PearlSwimCycleV15 120 frames 30 fps',
 'bboxBlenderZUp':bbox,'shapeRevision':'Whole rig and skin transformed consistently: transverse 1.08, axial .75, vertical 1.13 about body datum. Eye reference regenerated, not assumed.',
 'source':'Original authored parametric skin, membranes, eye sockets and weighted twenty-bone armature; no external mesh, texture or AI-generated geometry',
 'boneNames':list(bones),'meshes':[o.name for o in meshes],'paletteLinearRGB':{'pearl':PEARL,'aqua':AQUA,'coral':CORAL,'lavender':LAVENDER}}
(ASSET/'rig-build-v15.json').write_text(json.dumps(stat,indent=2),encoding='utf-8')
print('RAINBOW_FISH_BUILD '+json.dumps(stat))
