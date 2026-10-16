"""Original celebration-cake still and GLB. CPU Cycles to coexist with TTS."""
import bpy, math, random, hashlib, json, numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'work/models';OUT=ROOT/'public/models';TEX=ROOT/'public/textures'
random.seed(20261014)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
def mat(name,col,rough=.5,metal=0,sss=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value=(*col,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
    if 'Subsurface Weight' in b.inputs:b.inputs['Subsurface Weight'].default_value=sss
    return m
cream=mat('Fresh vanilla cream',(.88,.82,.68),.5,sss=.08)
icing=mat('Whipped cream',(.94,.91,.82),.44,sss=.08)
strawberry=mat('Strawberry skin',(.32,.008,.004),.39,sss=.006)
seedmat=mat('Strawberry seeds',(.68,.39,.11),.4)
leafmat=mat('Fresh green leaves',(.035,.13,.025),.47)
plate=mat('Warm white porcelain',(.84,.85,.81),.22)
back=mat('Warm studio',(.65,.63,.57),.8)
# A genuine UV image texture with seeded achene dimples, stored and embedded in GLB.
res=1024;yy,xx=np.mgrid[0:res,0:res]/res;rng=np.random.default_rng(20261014)
height=np.ones((res,res))*.5;variation=rng.normal(0,.01,(res,res))
for j in range(1,8):
    t=j/9;num=max(5,int(13*math.sin(math.pi*t)))
    for i in range(num):
        u=(i+.5*(j%2))/num;du=np.minimum(np.abs(xx-u),1-np.abs(xx-u));dv=yy-t
        dent=np.exp(-((du/.015)**2+(dv/.019)**2)*2)
        height-=dent*.35;variation-=dent*.08
def image_texture(name,pixels):
    im=bpy.data.images.new(name,res,res,alpha=True);im.pixels.foreach_set(np.asarray(pixels,dtype=np.float32).ravel());im.filepath_raw=str(TEX/name);im.file_format='PNG';im.save();im.pack();return im
rgb=np.empty((res,res,4));rgb[:,:,0]=.62+variation;rgb[:,:,1]=.035+variation*.1;rgb[:,:,2]=.02+variation*.07;rgb[:,:,3]=1
colorimg=image_texture('strawberry_color.png',np.clip(rgb,0,1))
dy,dx=np.gradient(height);normal=np.dstack((-dx*28,-dy*28,np.ones_like(height)));normal/=np.linalg.norm(normal,axis=2)[:,:,None]
rgba=np.concatenate([normal*.5+.5,np.ones((res,res,1))],2);normalimg=image_texture('strawberry_normal.png',rgba);normalimg.colorspace_settings.name='Non-Color'
bs=next(n for n in strawberry.node_tree.nodes if n.type=='BSDF_PRINCIPLED');cn=strawberry.node_tree.nodes.new('ShaderNodeTexImage');cn.image=colorimg;strawberry.node_tree.links.new(cn.outputs['Color'],bs.inputs['Base Color'])
nn=strawberry.node_tree.nodes.new('ShaderNodeTexImage');nn.image=normalimg;nm=strawberry.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.7;strawberry.node_tree.links.new(nn.outputs['Color'],nm.inputs['Color']);strawberry.node_tree.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
def mesh(name,verts,faces,material,root=None):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.data.materials.append(material);o.parent=root
    for p in me.polygons:p.use_smooth=True
    return o
def lathe(name,profile,material,root=None,N=128):
    v=[];f=[]
    for r,z in profile:
        for i in range(N):a=i*2*math.pi/N;v.append((r*math.cos(a),r*math.sin(a),z))
    for j in range(len(profile)-1):
        for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    return mesh(name,v,f,material,root)
root=bpy.data.objects.new('Cake',None);s.collection.objects.link(root);root['units']='metres';root['diameter_m']=.18;root['creator']='rainbow鱼 original procedural modeling'
lathe('VanillaLayerCake',[(0,0),(.083,0),(.088,.002),(.09,.006),(.09,.063),(.088,.068),(.083,.070),(0,.070)],cream,root)
# Fine piped cream rings add an edible, assembled edge rather than a perfect toy cylinder.
for z in [.004,.010,.016,.022,.028,.034,.040,.046,.052,.058]:
    profile=[(.0895,z-.00035),(.09015,z),(.0895,z+.00035)]
    lathe('FineSpatulaRing',profile,cream,root,192)
lathe('IcingTop',[(0,.070),(.083,.070),(.089,.068),(.090,.066),(.0903,.068),(.088,.072),(.081,.073),(0,.073)],icing,root)

def rosette(name,cx,cy,z):
    N=48;J=20;v=[];f=[]
    for j in range(J):
        t=j/(J-1);r=.010*(1-t)**.65*(.8+.3*math.sin(math.pi*t))+.00015
        for i in range(N):
            a=i*2*math.pi/N;rr=r*(1+.16*math.cos(7*a-4*t));v.append((cx+rr*math.cos(a)+.003*t*t,cy+rr*math.sin(a),z+.016*t))
    for j in range(J-1):
        for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    mesh(name,v,f,icing,root)
for i in range(12):
    a=2*math.pi*i/12;rosette('PipedCreamRosette',.071*math.cos(a),.071*math.sin(a),.073)

def berry(idx,cx,cy,z,ang):
    N=48;J=24;v=[];f=[]
    def radius(t):return .013*math.sin(math.pi*max(.0001,min(.9999,t)))**.60*(1-.36*t)
    for j in range(J):
        t=j/(J-1);r=radius(t)
        for i in range(N):
            a=i*2*math.pi/N;rr=r*(1+.025*math.sin(9*a+13*t));v.append((cx+rr*math.cos(a),cy+rr*math.sin(a),z+.030*t))
    for j in range(J-1):
        for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    body=mesh('Strawberry_'+str(idx),v,f,strawberry,root)
    uv=body.data.uv_layers.new()
    for poly in body.data.polygons:
        for li in poly.loop_indices:
            vi=body.data.loops[li].vertex_index;uv.data[li].uv=(vi%N/N,vi//N/(J-1))
    # Seed geometry at observed latitudes, with a small inset rather than bulky spots.
    for j in range(1,8):
        t=j/9;num=max(5,int(13*math.sin(math.pi*t)))
        for i in range(num):
            a=2*math.pi*(i+.5*(j%2))/num;r=radius(t)+.00005
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,location=(cx+r*math.cos(a),cy+r*math.sin(a),z+.030*t));o=bpy.context.object;o.name='BerrySeed';o.scale=(.00032,.00032,.00057);o.rotation_euler=(.25*math.sin(a),-.25*math.cos(a),a);o.parent=root;o.data.materials.append(seedmat)
            for p in o.data.polygons:p.use_smooth=True
    for i in range(5):
        a=ang+2*math.pi*i/5
        vv=[(cx,cy,z+.002),(cx+.006*math.cos(a-.45),cy+.006*math.sin(a-.45),z+.001),(cx+.017*math.cos(a),cy+.017*math.sin(a),z-.0003),(cx+.006*math.cos(a+.45),cy+.006*math.sin(a+.45),z+.001)]
        mesh('BerryLeaf',vv,[(0,1,2),(0,2,3)],leafmat,root)
for i in range(5):
    a=2*math.pi*i/5+.3;berry(i,.037*math.cos(a),.037*math.sin(a),.074,a)
berry(6,0,0,.076,.6)

# Preserve semantic parts while avoiding hundreds of fruit-seed draw calls in Three.
for prefix,combined in [('BerrySeed','StrawberrySeeds'),('BerryLeaf','StrawberryLeaves'),('PipedCreamRosette','CreamRosettes'),('FineSpatulaRing','CreamSpatulaDetail')]:
    objects=[o for o in root.children_recursive if o.type=='MESH' and o.name.startswith(prefix)]
    if objects:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name=combined

# Export cake only; porcelain plate belongs to still-lighting set.
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.context.view_layer.objects.active=root
path=OUT/'cake.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True)
lathe('PorcelainPlate',[(0,-.005),(.075,-.005),(.116,-.003),(.126,.001),(.127,.004),(.124,.006),(.113,.004),(.096,.001),(0,-.0003)],plate)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));bpy.context.object.data.materials.append(back)
def light(name,loc,power,size,col):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=col;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.05))-o.location).to_track_quat('-Z','Y').to_euler()
light('Softbox',(-.25,-.25,.42),5,.4,(1,.96,.89));light('Fill',(.3,.2,.3),3,.45,(.85,.92,1));light('Rim',(-.15,.27,.24),2,.25,(1,.99,.95))
s.world.color=(.16,.16,.16)
bpy.ops.object.camera_add(location=(.26,-.36,.25));cam=bpy.context.object;s.camera=cam;target=Vector((0,0,.043));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=53;cam.data.clip_start=.001;cam.data.dof.use_dof=True;cam.data.dof.focus_distance=(target-cam.location).length;cam.data.dof.aperture_fstop=8
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=40;s.cycles.use_denoising=True;s.view_settings.view_transform='AgX'
s.render.resolution_x=1024;s.render.resolution_y=768;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.filepath=str(TEX/'birthday-cake.png')
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'birthday_cake.blend'));bpy.ops.render.render(write_still=True)
rec={'version':'3.0','source':'Original dimensioned Blender model and original CPU Cycles rendering','license':'Original project asset','units':'metres','cakeDiameter':.18,'root':'Cake','image':{'path':'public/textures/birthday-cake.png','sha256':hashlib.sha256((TEX/'birthday-cake.png').read_bytes()).hexdigest()},'model':{'path':'public/models/cake.glb','sha256':hashlib.sha256(path.read_bytes()).hexdigest()},'blend':{'path':'work/models/birthday_cake.blend','sha256':hashlib.sha256((WORK/'birthday_cake.blend').read_bytes()).hexdigest()}}
(ROOT/'docs/models-cake.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2),encoding='utf8');print('CAKE_COMPLETE')
