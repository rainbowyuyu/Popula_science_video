"""Original rainbow-fish mascot: real weighted skin and reproducible Blender source.

All shape and weights are authored here; no downloaded mesh, texture, or live clock.
Authoring coordinates match Three (Y up, +Z forward), converted to Blender Z-up.
"""
import argparse, json, math, hashlib
from pathlib import Path
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--asset-dir', required=True)
parser.add_argument('--review-dir', required=True)
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index('--') + 1:])
ASSET = Path(args.asset_dir); REVIEW = Path(args.review_dir)
ASSET.mkdir(parents=True, exist_ok=True); REVIEW.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def P(v): return Vector((v[0], -v[2], v[1]))
def lerp(a,b,t): return tuple(a[i]*(1-t)+b[i]*t for i in range(len(a)))
def clamp(x): return max(0,min(1,x))
def smooth(x): x=clamp(x); return x*x*(3-2*x)

def material(name, color, rough=.3, metal=.08, coat=.6):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    n=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if n is None:
        m.node_tree.nodes.clear(); n=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out=m.node_tree.nodes.new('ShaderNodeOutputMaterial'); m.node_tree.links.new(n.outputs['BSDF'],out.inputs['Surface'])
    n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Roughness'].default_value=rough; n.inputs['Metallic'].default_value=metal
    n.inputs['Coat Weight'].default_value=coat; n.inputs['Coat Roughness'].default_value=.22
    return m

pearl=material('Pearl skin - vertex painted',(.72,.90,.88),.28,.12,.68)
color_node=pearl.node_tree.nodes.new('ShaderNodeVertexColor'); color_node.layer_name='Color'
pearl.node_tree.links.new(color_node.outputs['Color'],next(n for n in pearl.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'])
finmat=material('Rainbow silk fins - vertex painted',(.37,.72,.76),.31,.08,.56)
cn=finmat.node_tree.nodes.new('ShaderNodeVertexColor'); cn.layer_name='Color'
finmat.node_tree.links.new(cn.outputs['Color'],next(n for n in finmat.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'])
ivory=material('Eye porcelain',(.93,.96,.91),.22,.04,.65)
ink=material('Optical iris',(.014,.049,.063),.16,.12,.82)
light=material('Eye catchlight',(.98,1,1),.08,.02,.90)
lip=material('Warm lip',(.53,.71,.70),.34,.02,.5)

# Nineteen deform bones, each with a real spatial pivot. Bone local Y is parallel
# to world up so euler interpretation is stable even on non-connected chains.
bones={
 'Root':((0,1.37,0),None),
 'Head':((0,1.40,.30),'Root'),
 'Jaw':((0,1.24,.58),'Head'),
 'Spine0':((0,1.36,.08),'Root'),
 'Spine1':((0,1.35,-.27),'Spine0'),
 'Spine2':((0,1.34,-.60),'Spine1'),
 'Tail0':((0,1.33,-.87),'Spine2'),
 'Tail1':((0,1.33,-1.12),'Tail0'),
 'Tail2':((0,1.33,-1.43),'Tail1'),
 'PectoralL0':((-.35,1.30,.15),'Root'),
 'PectoralL1':((-.67,1.27,-.07),'PectoralL0'),
 'PectoralR0':((.35,1.30,.15),'Root'),
 'PectoralR1':((.67,1.27,-.07),'PectoralR0'),
 'Dorsal':((0,1.69,-.20),'Spine0'),
 'PelvicL0':((-.16,1.00,-.35),'Spine1'),
 'PelvicL1':((-.32,.90,-.60),'PelvicL0'),
 'PelvicR0':((.16,1.00,-.35),'Spine1'),
 'PelvicR1':((.32,.90,-.60),'PelvicR0'),
 'Anal':((0,1.04,-.63),'Spine2')}
armdata=bpy.data.armatures.new('RainbowFishSkeleton'); arm=bpy.data.objects.new('RainbowFishRig',armdata)
bpy.context.collection.objects.link(arm); bpy.context.view_layer.objects.active=arm
arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
for name,(head,parent) in bones.items():
    b=armdata.edit_bones.new(name); b.head=P(head); b.tail=P((head[0],head[1]+.16,head[2]))
    if parent: b.parent=armdata.edit_bones[parent]
    b.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT'); arm.show_in_front=True
meshes=[]

def mesh(name, vertices, faces, weights, colors, mat):
    data=bpy.data.meshes.new(name); data.from_pydata([P(v) for v in vertices],[],faces); data.update()
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.data.materials.append(mat)
    for p in data.polygons: p.use_smooth=True
    if colors:
        attr=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(colors): attr.data[i].color=(*c,1)
    groups={n:obj.vertex_groups.new(name=n) for n in bones}
    for i,w in enumerate(weights):
        total=sum(w.values())
        for bone,value in w.items():
            if value>1e-7: groups[bone].add([i],value/total,'REPLACE')
    mod=obj.modifiers.new('Weighted anatomy','ARMATURE'); mod.object=arm
    obj.parent=arm; meshes.append(obj); return obj

def spectrum(t):
    stops=[(.20,.07,.50),(.08,.28,.83),(.06,.62,.72),(.19,.61,.30),(.96,.67,.14),(.91,.30,.18),(.65,.18,.39)]
    a=clamp(t)*(len(stops)-1); i=min(len(stops)-2,int(a)); return lerp(stops[i],stops[i+1],a-i)

centers=[(-1.03,'Tail0'),(-.70,'Spine2'),(-.35,'Spine1'),(.03,'Spine0'),(.48,'Head')]
def bodyweight(z):
    if z<=centers[0][0]: return {centers[0][1]:1}
    if z>=centers[-1][0]: return {centers[-1][1]:1}
    for (a,ba),(b,bb) in zip(centers,centers[1:]):
        if a<=z<=b:
            t=smooth((z-a)/(b-a)); return {ba:1-t,bb:t}

# Closed high-resolution continuous torso, tapering into a narrow caudal peduncle.
verts=[]; faces=[]; weights=[]; colors=[]; NR=52; NS=64
for j in range(NR+1):
    t=j/NR; z=-1.10+1.88*t
    bulb=math.sin(math.pi*t)**.66
    rx=.065+.378*bulb*(.68+.32*t)
    ry=.085+.405*bulb
    center=1.33+.07*smooth(t)
    if j in (0,NR): rx=.028 if j==0 else .05; ry=.033 if j==0 else .06
    for k in range(NS):
        a=2*math.pi*k/NS; x=rx*math.cos(a); y=center+ry*math.sin(a)
        verts.append((x,y,z)); weights.append(bodyweight(z))
        top=smooth((math.sin(a)+.22)/1.12)
        base=lerp((.82,.91,.79),(.10,.34,.37),top*.92)
        # A soft iridescent lateral ribbon, not seven disconnected paint rectangles.
        ribbon=math.exp(-((math.sin(a)-.10)/.38)**2)*.88
        colors.append(lerp(base,spectrum(.14+.75*t),ribbon))
for j in range(NR):
    for k in range(NS):
        n=(k+1)%NS; a=j*NS+k; b=j*NS+n; c=(j+1)*NS+n; d=(j+1)*NS+k
        faces.append((a,b,c,d))
faces.append(tuple(reversed(tuple(range(NS)))))
faces.append(tuple(NR*NS+k for k in range(NS)))
body=mesh('ContinuousPearlBody',verts,faces,weights,colors,pearl)

def ellipsoid(name,center,radii,mat,bone='Head',rows=20,cols=32):
    vs=[]; fs=[]
    for j in range(rows+1):
        phi=math.pi*j/rows
        for k in range(cols):
            theta=2*math.pi*k/cols
            vs.append((center[0]+radii[0]*math.sin(phi)*math.cos(theta),
                       center[1]+radii[1]*math.cos(phi),
                       center[2]+radii[2]*math.sin(phi)*math.sin(theta)))
    for j in range(rows):
        for k in range(cols): fs.append((j*cols+k,j*cols+(k+1)%cols,(j+1)*cols+(k+1)%cols,(j+1)*cols+k))
    painted=mat in (pearl,finmat)
    return mesh(name,vs,fs,[{bone:1} for _ in vs],[tuple(mat.diffuse_color[:3]) for _ in vs] if painted else None,mat)

# Wide, friendly eyes are embedded into the head instead of two floating eyeballs.
# Their front lens poles midpoint is exactly (0,1.55,0.750).
for side,sgn in [('L',-1),('R',1)]:
    ellipsoid('EyeWhite'+side,(sgn*.225,1.55,.571),(.164,.166,.143),ivory)
    ellipsoid('EyeIris'+side,(sgn*.225,1.55,.696),(.105,.116,.054),ink)
    ellipsoid('Catchlight'+side,(sgn*.225-.028,1.593,.745),(.023,.027,.011),light,rows=12,cols=20)
    ellipsoid('CatchlightSmall'+side,(sgn*.225+.030,1.515,.746),(.010,.012,.008),light,rows=10,cols=16)

# Warm tiny mouth: a curved lip with a low jaw bone, no anthropomorphic teeth.
vs=[];fs=[]
for j in range(33):
    t=j/32; x=-.096+.192*t; y=1.249-.019*math.sin(math.pi*t); z=.777-.045*((2*t-1)**2)
    for k in range(10):
        a=2*math.pi*k/10; vs.append((x,y+.009*math.cos(a),z+.009*math.sin(a)))
for j in range(32):
    for k in range(10): fs.append((j*10+k,j*10+(k+1)%10,(j+1)*10+(k+1)%10,(j+1)*10+k))
mesh('SoftMouthLip',vs,fs,[{'Jaw':1} for _ in vs],None,lip)

def membrane(name,origin,edge,bone0,bone1=None,mode='fan'):
    """A curved, slightly thick membrane with coherent base/tip bone blending."""
    vs=[]; ws=[]; cs=[]; fs=[]; R=15; C=34
    for layer in [-1,1]:
        for r in range(R+1):
            u=r/R
            for k in range(C+1):
                t=k/C; outer=edge(t)
                v=list(lerp(origin,outer,u))
                wave=.015*math.sin(math.pi*u)*math.sin(6*math.pi*t)
                if mode=='tail': v[0]+=layer*(.006+.010*math.sin(math.pi*u))+wave
                else: v[1]+=layer*(.006+.010*math.sin(math.pi*u))+wave
                vs.append(tuple(v)); tip=smooth((u-.18)/.82)
                ws.append({bone0:1-tip,bone1:tip} if bone1 else {bone0:1})
                color=spectrum(t*.90+.04)
                cs.append(lerp((.25,.64,.61),color,.65+.32*u))
    count=(R+1)*(C+1)
    for layer in range(2):
        for r in range(R):
            for k in range(C):
                a=layer*count+r*(C+1)+k; b=a+1; d=a+C+1; c=d+1
                fs.append((a,b,c,d) if layer==0 else (d,c,b,a))
    for k in range(C):
        a=R*(C+1)+k; fs.append((a,a+1,a+1+count,a+count))
    for r in range(R):
        a=r*(C+1); b=(r+1)*(C+1); fs.append((a,b,b+count,a+count))
        a=r*(C+1)+C; b=(r+1)*(C+1)+C; fs.append((b,a,a+count,b+count))
    return mesh(name,vs,fs,ws,cs,finmat)

# Koi-like bilobed tail: spread vertically, elegant deep indentation at its centre.
def tail_edge(t):
    y=1.33+1.09*(t-.5)
    depth=1.62+.38*abs(2*t-1)**.65
    return (.0,y,-depth)
membrane('BilobedCaudalFan',(0,1.33,-1.05),tail_edge,'Tail1','Tail2','tail')
ellipsoid('CaudalPeduncle',(0,1.33,-1.06),(.085,.11,.22),pearl,'Tail0')

for side,sgn in [('L',-1),('R',1)]:
    def pec_edge(t,s=sgn):
        a=math.pi*t
        return (s*(.39+.59*math.sin(a)**.70),1.28-.13*math.sin(a),.27-.70*t)
    membrane('PectoralSilk'+side,(sgn*.35,1.30,.15),pec_edge,'Pectoral'+side+'0','Pectoral'+side+'1')
    def pel_edge(t,s=sgn): return (s*(.16+.25*math.sin(math.pi*t)),.96-.18*math.sin(math.pi*t),-.24-.45*t)
    membrane('PelvicSilk'+side,(sgn*.16,1.00,-.35),pel_edge,'Pelvic'+side+'0','Pelvic'+side+'1')

# Dorsal fin is in the central sagittal plane; it follows the rear body naturally.
def dorsal_edge(t): return (.0,1.69+.36*math.sin(math.pi*t)**.7,.16-.91*t)
membrane('DorsalSail',(0,1.67,-.20),dorsal_edge,'Dorsal',None,'tail')
def anal_edge(t): return (.0,1.03-.20*math.sin(math.pi*t),-.50-.34*t)
membrane('AnalSail',(0,1.04,-.63),anal_edge,'Anal',None,'tail')

def marker(name,position,bone=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o)
    o.empty_display_type='SPHERE'; o.empty_display_size=.045; o.location=P(position)
    if bone:
        o.parent=arm; o.parent_type='BONE'; o.parent_bone=bone
        bpy.context.view_layer.update(); o.matrix_world.translation=P(position)
    return o
marker('EyeReference',(0,1.55,.75),'Head')
marker('HoverReference',(0,.85,.0))

# Author an actual reusable animation clip in the source/GLB. Production adapter
# evaluates the same bones analytically per frame rather than accumulating time.
arm.animation_data_create(); action=bpy.data.actions.new('SwimCycle'); arm.animation_data.action=action
for frame in range(1,61,3):
    phase=2*math.pi*(frame-1)/60
    for j,name in enumerate(['Spine0','Spine1','Spine2','Tail0','Tail1','Tail2']):
        b=arm.pose.bones[name]; b.rotation_mode='XYZ'
        # Blender local Y along vertical Z: local Y is the lateral yaw axis.
        b.rotation_euler=(0,math.radians(2+j*2.1)*math.sin(phase-j*.48),0)
        b.keyframe_insert(data_path='rotation_euler',frame=frame)
    for side,sgn in [('L',-1),('R',1)]:
        for tip in [0,1]:
            b=arm.pose.bones['Pectoral'+side+str(tip)];b.rotation_mode='XYZ'
            b.rotation_euler=(math.radians(4)*math.sin(phase+.4),0,sgn*math.radians(9+tip*3)*math.sin(phase))
            b.keyframe_insert(data_path='rotation_euler',frame=frame)
for name in bones: arm.pose.bones[name].rotation_euler=(0,0,0)
bpy.context.scene.frame_set(1)
# Remove animation before evaluating the neutral reference/export source.
arm.animation_data.action=None

scene=bpy.context.scene;scene.render.engine='CYCLES'; scene.cycles.samples=48
scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.color=(.08,.08,.08);scene.world.use_nodes=True
bg=next((n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'),None)
if bg is None:
    scene.world.node_tree.nodes.clear(); bg=scene.world.node_tree.nodes.new('ShaderNodeBackground')
    wo=scene.world.node_tree.nodes.new('ShaderNodeOutputWorld'); scene.world.node_tree.links.new(bg.outputs['Background'],wo.inputs['Surface'])
bg.inputs['Color'].default_value=(.65,.75,.79,1)
bg.inputs['Strength'].default_value=.55
scene.view_settings.view_transform='AgX'

floor=material('Review warm gallery',(.77,.82,.80),.6,0,0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.1));plane=bpy.context.object;plane.name='ReviewFloor';plane.data.materials.append(floor)
def area(name,location,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=P(location));o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color
    o.rotation_euler=(P((0,1.35,-.25))-o.location).to_track_quat('-Z','Y').to_euler()
area('Pearl key',(-3,5,4),650,4,(1,.94,.83))
area('Cool fill',(4,3,1),420,4,(.76,.91,1))
area('Rainbow rim',(0,4,-4),850,3,(.84,.91,1))
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='ReviewCamera';scene.camera=camera
camera.data.type='ORTHO';camera.data.ortho_scale=4.4

# Export only the actual character; studio lights/floor are separate source helpers.
for o in bpy.context.selected_objects: o.select_set(False)
arm.select_set(True)
for o in meshes:o.select_set(True)
for n in ['EyeReference','HoverReference']:bpy.data.objects[n].select_set(True)
bpy.context.view_layer.objects.active=arm
glb=ASSET.parent/'rainbow_fish.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_skins=True,export_all_influences=False,export_apply=False)

views={'front-threequarter':(3.7,2.8,4.7),'side':(5.2,2.2,.2),'back-threequarter':(-3.8,2.7,-4.5)}
for name,pos in views.items():
    camera.location=P(pos);camera.rotation_euler=(P((0,1.35,-.36))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)

# Restore the reusable animation in .blend after neutral model beauty renders.
arm.animation_data.action=action;scene.frame_start=1;scene.frame_end=60;scene.render.fps=30
scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'rainbow-fish-source-v10.blend'))
stat={'boneCount':len(bones),'meshCount':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),
 'multiboneVertices':sum(1 for o in meshes for v in o.data.vertices if len([g for g in v.groups if g.weight>1e-5])>1),
 'glbSHA256':hashlib.sha256(glb.read_bytes()).hexdigest(),'eyeAuthored':[0,1.55,.75],
 'glTFUp':'Y','glTFForward':'+Z','clipInBlend':'SwimCycle 60 frames 30 fps',
 'source':'Original mathematically authored character; no external mesh/texture',
 'boneNames':list(bones),'meshes':[o.name for o in meshes]}
(ASSET/'rig-build-v10.json').write_text(json.dumps(stat,indent=2),encoding='utf-8')
print('RAINBOW_FISH_BUILD '+json.dumps(stat))
