"""V19 hand-painted chibi rainbow fish: readable elongated silhouette, 20-bone skin.

Authored Y-up/+Z-forward geometry is converted coherently to Blender Z-up.
No V15 asset or public junction is modified. Source reference: user-01.png.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
from mathutils import Vector

ap=argparse.ArgumentParser()
ap.add_argument('--asset-dir',required=True)
ap.add_argument('--review-dir',required=True)
ap.add_argument('--samples',type=int,default=48)
args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
ASSET=Path(args.asset_dir).resolve(); REVIEW=Path(args.review_dir).resolve()
if 'assets_v19' not in ASSET.parts: raise ValueError('Only V19 asset directory is writable')
ASSET.mkdir(parents=True,exist_ok=True); REVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def P(v): return Vector((v[0],-v[2],v[1]))
def mix(a,b,t): return tuple(x*(1-t)+y*t for x,y in zip(a,b))
def clamp(x): return max(0,min(1,x))
def smooth(x): x=clamp(x); return x*x*(3-2*x)
def rgb(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)

MINT=rgb('69CDBD'); CREAM=rgb('FFF3DC'); LAVENDER=rgb('AA91E1')
ROSE=rgb('EE8FC9'); APRICOT=rgb('F3B6D0'); BLUSH=rgb('F5936F')
BLACK=rgb('102329'); WHITE=rgb('FFFFFF'); MOUTH=rgb('473A39')

def material(name,color,rough=.35,coat=.26,paint=False):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if n is None:
        m.node_tree.nodes.clear();n=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(n.outputs['BSDF'],out.inputs['Surface'])
    n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=0
    n.inputs['Coat Weight'].default_value=coat;n.inputs['Coat Roughness'].default_value=.24
    if paint:
        a=m.node_tree.nodes.new('ShaderNodeVertexColor');a.layer_name='Color'
        m.node_tree.links.new(a.outputs['Color'],n.inputs['Base Color'])
    return m

skin=material('V18 Soft mint cream skin',CREAM,.37,.30,True)
finmat=material('V18 Pastel satin fins',ROSE,.42,.18,True)
eye_mat=material('V18 Black pearl eyes',BLACK,.26,.16)
next(n for n in eye_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Specular IOR Level'].default_value=.20
light_mat=material('V18 Soft eye catchlight',WHITE,.20,.36)
mouth_mat=material('V18 Tiny warm mouth',MOUTH,.43,.12)
line_mat=material('V18 Subtle shoulder engraving',rgb('75B8AD'),.47,.12)
gill_mat=material('V18 Soft teal gill marks',rgb('3E7779'),.58,.08)
cheek_mat=material('V18 Rosewater cheek glaze',rgb('F48F84'),.48,.10)

# Compact anatomy with the same public twenty-bone interface as V15.
bones={
 'Root':((0,1.37,-.02),None),'Head':((0,1.46,.24),'Root'),'Jaw':((0,1.34,.47),'Head'),
 'Spine0':((0,1.37,.01),'Root'),'Spine1':((0,1.37,-.20),'Spine0'),
 'Spine2':((0,1.37,-.42),'Spine1'),'Tail0':((0,1.37,-.67),'Spine2'),
 'Tail1':((0,1.37,-.84),'Tail0'),'Tail2':((0,1.37,-1.04),'Tail1'),
 'Tail3':((0,1.37,-1.23),'Tail2'),
 'PectoralL0':((-.56,1.34,.21),'Root'),'PectoralL1':((-.78,1.34,.04),'PectoralL0'),
 'PectoralR0':((.56,1.34,.21),'Root'),'PectoralR1':((.78,1.34,.04),'PectoralR0'),
 'Dorsal':((0,1.86,-.15),'Spine0'),
 'PelvicL0':((-.25,.87,-.12),'Spine1'),'PelvicL1':((-.32,.72,-.24),'PelvicL0'),
 'PelvicR0':((.25,.87,-.12),'Spine1'),'PelvicR1':((.32,.72,-.24),'PelvicR0'),
 'Anal':((0,.87,-.38),'Spine2')}
ad=bpy.data.armatures.new('RainbowFishSkeletonV18');arm=bpy.data.objects.new('RainbowFishRigV18',ad)
bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(p,parent) in bones.items():
    b=ad.edit_bones.new(name);b.head=P(p);b.tail=P((p[0],p[1]+.12,p[2]))
    if parent:b.parent=ad.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');arm.show_in_front=True;meshes=[]

def mesh(name,vs,fs,ws,cs,mat):
    d=bpy.data.meshes.new(name);d.from_pydata([P(v) for v in vs],[],fs);d.update()
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);d.materials.append(mat)
    for p in d.polygons:p.use_smooth=True
    if cs:
        a=d.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(cs):a.data[i].color=(*c,1)
    groups={n:o.vertex_groups.new(name=n) for n in bones}
    for i,w in enumerate(ws):
        total=sum(w.values())
        for n,v in w.items():
            if v>1e-7:groups[n].add([i],v/total,'REPLACE')
    mod=o.modifiers.new('V18 continuous weighted skin','ARMATURE');mod.object=arm
    o.parent=arm;meshes.append(o);return o

def bodyweight(z):
    centres=[(-.67,'Tail0'),(-.42,'Spine2'),(-.22,'Spine1'),(.025,'Spine0'),(.28,'Head')]
    if z<=centres[0][0]:return {centres[0][1]:1}
    if z>=centres[-1][0]:return {centres[-1][1]:1}
    for (a,na),(b,nb) in zip(centres,centres[1:]):
        if a<=z<=b:
            t=smooth((z-a)/(b-a));return {na:1-t,nb:t}

CX,CY,CZ=0,1.37,-.015
# A slightly wider, lower oval keeps the readable three-quarter silhouette
# from the reference illustration while remaining a true 3-D volume.
# V19 extends the body along local +Z/-Z by about ten percent. The eye anchor
# and world-space height remain unchanged at runtime, while the tail and fins
# read clearly in the garden's wide shots instead of collapsing into a sphere.
RX,RY,RZ=.695,.665,.805
def front_z(x,y):
    q=max(.008,1-(x/RX)**2-((y-CY)/RY)**2)
    return CZ+RZ*math.sqrt(q)

vs=[];fs=[];ws=[];cs=[];NR,NS=88,120
for j in range(NR+1):
    u=-1+2*j/NR;z=CZ+RZ*u
    r=math.sqrt(max(0,1-u*u))
    for k in range(NS):
        a=2*math.pi*k/NS;x=RX*r*math.cos(a);y=CY+RY*r*math.sin(a)
        vs.append((x,y,z));ws.append(bodyweight(z))
        # Broad continuous watercolor-style regions, no stripy noise.
        c=MINT
        face=smooth((z-.02)/.42)*(1-.88*smooth((y-1.60)/.29))
        belly=smooth((1.48-y)/.49)
        c=mix(c,CREAM,max(face,belly*.72))
        lavender=smooth((1.16-y)/.39)*.75
        c=mix(c,LAVENDER,lavender)
        cheek=0
        for sx in (-.365,.365):
            cheek=max(cheek,math.exp(-((x-sx)/.142)**2-((y-1.345)/.12)**2))
        cheek*=smooth((z-.30)/.14)*.94
        c=mix(c,BLUSH,cheek);cs.append(c)
for j in range(NR):
    for k in range(NS):
        n=(k+1)%NS;fs.append((j*NS+k,j*NS+n,(j+1)*NS+n,(j+1)*NS+k))
body=mesh('ContinuousPearlBody',vs,fs,ws,cs,skin)

def ellipsoid(name,center,radii,mat,bone='Head',rows=18,cols=32):
    vs=[];fs=[]
    for j in range(rows+1):
        p=math.pi*j/rows
        for k in range(cols):
            a=2*math.pi*k/cols
            vs.append((center[0]+radii[0]*math.sin(p)*math.cos(a),center[1]+radii[1]*math.cos(p),center[2]+radii[2]*math.sin(p)*math.sin(a)))
    for j in range(rows):
        for k in range(cols):fs.append((j*cols+k,j*cols+(k+1)%cols,(j+1)*cols+(k+1)%cols,(j+1)*cols+k))
    return mesh(name,vs,fs,[{bone:1} for _ in vs],None,mat)

# A curved surface patch follows the actual forehead. It never has a white
# protruding eye socket. Black button lenses stay readable in three-quarter.
eye_centres=[]
for side,sgn in [('L',-1),('R',1)]:
    ex,ey=sgn*.242,1.572;vs=[];fs=[];R,C=20,64
    for j in range(R+1):
        r=j/R
        for k in range(C):
            a=2*math.pi*k/C;x=ex+.106*r*math.cos(a);y=ey+.123*r*math.sin(a)
            z=front_z(x,y)+.007+.012*(1-r*r)
            vs.append((x,y,z))
    for j in range(R):
        for k in range(C):fs.append((j*C+k,(j+1)*C+k,(j+1)*C+(k+1)%C,j*C+(k+1)%C))
    mesh('EyeIris'+side,vs,fs,[{'Head':1} for _ in vs],None,eye_mat)
    eye_centres.append((ex,ey,front_z(ex,ey)+.019))
    hx,hy=ex-.025,ey+.041
    ellipsoid('V18 Catchlight'+side,(hx,hy,front_z(hx,hy)+.024),(.017,.020,.006),light_mat,rows=12,cols=20)
    hx,hy=ex+.034,ey-.035
    ellipsoid('V18 CatchlightSmall'+side,(hx,hy,front_z(hx,hy)+.025),(.006,.007,.004),light_mat,rows=10,cols=16)

def tube(name,points,radius,mat,bone='Head',cols=10):
    vs=[];fs=[]
    for x,y,z in points:
        for k in range(cols):
            a=2*math.pi*k/cols;vs.append((x,y+radius*math.cos(a),z+radius*math.sin(a)))
    for j in range(len(points)-1):
        for k in range(cols):fs.append((j*cols+k,j*cols+(k+1)%cols,(j+1)*cols+(k+1)%cols,(j+1)*cols+k))
    return mesh(name,vs,fs,[{bone:1} for _ in vs],None,mat)

# Small, surface-following cheek glazes and gill strokes keep the face
# expressive in the wide garden shots while remaining genuine skinned 3-D
# geometry.  They move with Head rather than behaving like a camera decal.
for side,sgn in [('L',-1),('R',1)]:
    cx,cy=sgn*.365,1.375
    ellipsoid('V18 CheekGlaze'+side,(cx,cy,front_z(cx,cy)+.014),(.105,.082,.018),cheek_mat,'Head',rows=14,cols=28)
    pts=[]
    for j in range(17):
        t=j/16; x=sgn*(.47-.095*t); y=1.44+.16*t
        pts.append((x,y,front_z(x,y)+.010))
    tube('V18 GillStroke'+side,pts,.005,gill_mat,'Head',cols=8)

points=[]
for j in range(41):
    t=j/40;x=-.060+.120*t;y=1.357-.016*math.sin(math.pi*t)
    points.append((x,y,front_z(x,y)+.008))
tube('V18 TinySmile',points,.0065,mouth_mat,'Jaw')

def tailweight(z):
    stops=[(-.67,'Tail0'),(-.86,'Tail1'),(-1.06,'Tail2'),(-1.27,'Tail3')]
    if z>=stops[0][0]:return {stops[0][1]:1}
    if z<=stops[-1][0]:return {stops[-1][1]:1}
    for (a,na),(b,nb) in zip(stops,stops[1:]):
        if b<=z<=a:
            t=smooth((a-z)/(a-b));return {na:1-t,nb:t}

def membrane(name,origin,edge,bone0,bone1=None,axis=0,palette=(ROSE,LAVENDER),tail=False):
    vs=[];fs=[];ws=[];cs=[];R,C=24,52
    for layer in (-1,1):
        for j in range(R+1):
            u=j/R
            for k in range(C+1):
                t=k/C;v=list(mix(origin,edge(t),u))
                v[axis]+=layer*(.010+.010*math.sin(math.pi*u))
                v[axis]+=.005*math.sin(math.pi*u)*math.cos(8*math.pi*t)
                vs.append(tuple(v));q=smooth((u-.08)/.92)
                ws.append(tailweight(v[2]) if tail else ({bone0:1-q,bone1:q} if bone1 else {bone0:1}))
                c=mix(palette[0],palette[1],smooth(t))
                c=mix(c,CREAM,smooth((u-.86)/.14)*.36)
                ray=.025*(.5+.5*math.cos(8*math.pi*t))**14*math.sin(math.pi*u)
                cs.append(tuple(clamp(v+ray) for v in c))
    N=(R+1)*(C+1)
    for layer in range(2):
        for j in range(R):
            for k in range(C):
                a=layer*N+j*(C+1)+k;b=a+1;d=a+C+1;c=d+1
                fs.append((a,b,c,d) if layer==0 else (d,c,b,a))
    for k in range(C):
        a=R*(C+1)+k;fs.append((a,a+1,a+1+N,a+N))
    for j in range(R):
        a=j*(C+1);b=(j+1)*(C+1);fs.append((a,b,b+N,a+N))
        a=j*(C+1)+C;b=(j+1)*(C+1)+C;fs.append((b,a,a+N,b+N))
    return mesh(name,vs,fs,ws,cs,finmat)

def tail_edge(t):
    u=2*t-1
    # Broader heart tail: two rounded lobes with a crisp central notch.
    return (0,1.37+.585*math.sin(math.pi*u/2),-(1.105+.255*math.sin(math.pi*abs(u))**.8-.068*abs(u)**4))
membrane('V18 ShortHeartTail',(0,1.37,-.65),tail_edge,'Tail0','Tail3',palette=(ROSE,LAVENDER),tail=True)
for side,sgn in [('L',-1),('R',1)]:
    def pec_edge(t,s=sgn):
        a=math.pi*t;return (s*(.58+.34*math.sin(a)**.82),1.36+.165*math.cos(a),.22-.22*math.sin(a))
    membrane('V18 Pectoral'+side,(sgn*.56,1.35,.21),pec_edge,'Pectoral'+side+'0','Pectoral'+side+'1',axis=2,palette=(ROSE,LAVENDER))
    def pel_edge(t,s=sgn):
        a=math.pi*t;return (s*(.25+.13*math.sin(a)),.87-.19*math.sin(a),-.09-.18*t)
    membrane('V18 Pelvic'+side,(sgn*.25,.89,-.10),pel_edge,'Pelvic'+side+'0','Pelvic'+side+'1',axis=2,palette=(LAVENDER,ROSE))
def dorsal_edge(t):return (0,1.91+.345*math.sin(math.pi*t)**.76,.12-.80*t)
membrane('V18 Dorsal',(0,1.86,-.17),dorsal_edge,'Dorsal',palette=(ROSE,LAVENDER))
def anal_edge(t):return (0,.88-.135*math.sin(math.pi*t),-.24-.30*t)
membrane('V18 Anal',(0,.89,-.36),anal_edge,'Anal',palette=(LAVENDER,ROSE))

def marker(name,position,bone=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.empty_display_type='SPHERE';o.empty_display_size=.04;o.location=P(position)
    if bone:
        o.parent=arm;o.parent_type='BONE';o.parent_bone=bone;bpy.context.view_layer.update();o.matrix_world.translation=P(position)
    return o
eye_mid=tuple(sum(p[i] for p in eye_centres)/2 for i in range(3))
marker('EyeReference',eye_mid,'Head');marker('HoverReference',(0,.85,0))

arm.animation_data_create();action=bpy.data.actions.new('ChibiSwimCycleV18');arm.animation_data.action=action
for f in range(1,122,3):
    p=2*math.pi*(f-1)/120
    for j,n in enumerate(['Spine0','Spine1','Spine2','Tail0','Tail1','Tail2','Tail3']):
        b=arm.pose.bones[n];b.rotation_mode='XYZ';b.rotation_euler=(0,(.004+j*.012)*math.sin(p-j*.43),0);b.keyframe_insert(data_path='rotation_euler',frame=f)
    for side,sgn in [('L',-1),('R',1)]:
        for tip in (0,1):
            b=arm.pose.bones['Pectoral'+side+str(tip)];b.rotation_mode='XYZ';b.rotation_euler=(.012*math.sin(p+.35),0,sgn*(.052+tip*.024)*math.sin(p));b.keyframe_insert(data_path='rotation_euler',frame=f)
    b=arm.pose.bones['Head'];b.rotation_euler=(.009*math.sin(p*.5),.013*math.sin(p*.5+.4),0);b.keyframe_insert(data_path='rotation_euler',frame=f)
arm.animation_data.action=None
for b in arm.pose.bones:b.rotation_euler=(0,0,0)

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=825;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True;bg=next((n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'),None)
if bg is None:
    scene.world.node_tree.nodes.clear();bg=scene.world.node_tree.nodes.new('ShaderNodeBackground')
    out=scene.world.node_tree.nodes.new('ShaderNodeOutputWorld');scene.world.node_tree.links.new(bg.outputs['Background'],out.inputs['Surface'])
bg.inputs['Color'].default_value=(*rgb('E4EEEB'),1);bg.inputs['Strength'].default_value=.36
scene.view_settings.view_transform='AgX'
floor_mat=material('V18 Review mint ivory ground',rgb('E2EBE4'),.68,0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.04));floor=bpy.context.object;floor.name='ReviewFloor';floor.data.materials.append(floor_mat)
def area(name,loc,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=P(loc));o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color
    o.rotation_euler=(P((0,1.35,-.15))-o.location).to_track_quat('-Z','Y').to_euler()
area('Soft morning key',(-3,4,4),520,4,(1,.94,.85));area('Cool mint fill',(3,3,2),190,4,(.80,.95,1));area('Silk contour',(0,4,-3),460,3,(.96,.90,1))
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='ReviewCamera';cam.data.type='ORTHO';cam.data.ortho_scale=2.78;scene.camera=cam
for o in bpy.context.selected_objects:o.select_set(False)
arm.select_set(True)
for o in meshes:o.select_set(True)
for n in ('EyeReference','HoverReference'):bpy.data.objects[n].select_set(True)
bpy.context.view_layer.objects.active=arm
glb=ASSET/'rainbow_fish_v19.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_skins=True,export_all_influences=False,export_apply=False)

views={'front':(0,1.85,5),'front-threequarter':(2.45,2.0,4.65),'front-threequarter-wide':(3.75,2.0,3.80),'side':(5,1.90,.1),'back-threequarter':(-3.5,2.10,-4.1)}
for name,pos in views.items():
    cam.location=P(pos);cam.rotation_euler=(P((0,1.39,-.18))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)
arm.animation_data.action=action
cam.location=P(views['front-threequarter']);cam.rotation_euler=(P((0,1.39,-.18))-cam.location).to_track_quat('-Z','Y').to_euler()
for f in (1,31,61,91):
    scene.frame_set(f);scene.render.filepath=str(REVIEW/('swim-%03d.png'%f));bpy.ops.render.render(write_still=True)
scene.frame_start=1;scene.frame_end=120;scene.render.fps=30;scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'rainbow-fish-source-v19.blend'))
vertices=[v for o in meshes for v in o.data.vertices]
stat={'version':'V19','boneCount':len(bones),'meshCount':len(meshes),'vertices':len(vertices),
 'multiboneVertices':sum(1 for o in meshes for v in o.data.vertices if len([g for g in v.groups if g.weight>1e-5])>1),
 'glbSHA256':hashlib.sha256(glb.read_bytes()).hexdigest(),'blendSHA256':hashlib.sha256((ASSET/'rainbow-fish-source-v19.blend').read_bytes()).hexdigest(),
 'eyeAuthored':eye_mid,'eyeReferenceDefinition':'Arithmetic midpoint of actual centre poles of both curved black eye patches; parented to Head bone',
 'glTFUp':'Y','glTFForward':'+Z','clipInBlend':'ChibiSwimCycleV19120frames30fps',
 'bboxBlenderZUp':{'min':[min(v.co[i] for v in vertices) for i in range(3)],'max':[max(v.co[i] for v in vertices) for i in range(3)]},
 'source':'Original procedural geometry, watercolor-like vertex paint and continuously weighted twenty-bone armature; no external mesh/texture/generated geometry; V19 fish-readability pass',
 'reference':'research/iterations/v16/user-01.png','shapeRevision':'Elongated mint-cream chibi body, enlarged pink-lavender pectoral/dorsal/heart tail fins, surface-conforming black button eyes, continuous blush in body paint, tiny smile. V19 orientation/readability pass.',
 'boneNames':list(bones),'meshes':[o.name for o in meshes],'paletteSRGB':{'mint':'69CDBD','cream':'FFF3DC','lavender':'BDA9E4','rose':'E5A2D0','apricot':'F3B6D0','blush':'F5936F'},
 'previewFiles':[str(p.relative_to(REVIEW)) for p in REVIEW.glob('*.png')],
 'visualAcceptance':'pending actual multi-angle and integrated scene inspection'}
(ASSET/'rig-build-v18.json').write_text(json.dumps(stat,ensure_ascii=False,indent=2),encoding='utf-8')
print('RAINBOW_FISH_BUILD_V19 '+json.dumps(stat))
