"""Original cryptography cover hero. Pillow textures + named Blender assets.

python this.py --textures
blender --background --python this.py -- --layout landscape --draft
"""
from pathlib import Path
import sys, math, json, hashlib
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'work/cover-art'; OUT=ROOT/'delivery/covers/artwork'
WORK.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)

def textures():
    from PIL import Image,ImageDraw,ImageFont,ImageFilter
    import numpy as np
    rng=np.random.default_rng(321)
    def font(n,serif=False):
        f=ImageFont.truetype('C:/Windows/Fonts/'+('NotoSerifSC-VF.ttf' if serif else 'NotoSansSC-VF.ttf'),n)
        try:f.set_variation_by_axes([600])
        except:pass
        return f
    ink=(27,61,62);gold=(173,132,75)
    for kind in ['order','cipher']:
        W,H=1600,2000
        a=np.ones((H,W,3),dtype=np.float32)*np.array([250,247,236])
        a+=rng.normal(0,.9,(H,W,1))
        im=Image.fromarray(a.clip(0,255).astype('uint8'));d=ImageDraw.Draw(im)
        d.line((130,180,W-130,180),fill=gold,width=7)
        if kind=='order':
            d.text((130,280),'生日蛋糕',font=font(186,True),fill=ink)
            d.text((136,540),'送到幸福路八号',font=font(85),fill=ink)
            d.line((136,710,W-136,710),fill=(208,207,195),width=3)
            cake=Image.open(ROOT/'public/textures/birthday-cake.png').convert('RGBA')
            cake.thumbnail((1090,910))
            im.paste(cake,((W-cake.width)//2,820),cake)
            d=ImageDraw.Draw(im)
            d.text((136,1780),'ORDER   /   08',font=font(48),fill=(125,139,132))
        else:
            d.text((130,280),'密文',font=font(186,True),fill=ink)
            mono=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',155)
            for y,s in [(640,'63 D8 BB 45'),(890,'1E 30 7F 02')]:d.text((130,y),s,font=mono,fill=ink)
            d.line((136,1190,W-136,1190),fill=(208,207,195),width=3)
            d.text((136,1310),'AD 23 EC 4E',font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',72),fill=gold)
            d.text((136,1780),'AES · GCM',font=font(48),fill=(125,139,132))
        im.save(WORK/(kind+'.png'))
    W,H=1200,2500
    im=Image.new('RGB',(W,H),(239,244,238));d=ImageDraw.Draw(im)
    d.rounded_rectangle((55,180,1145,420),radius=50,fill=ink)
    d.text((126,224),'蛋糕订单',font=font(128),fill='white')
    cake=Image.open(ROOT/'public/textures/birthday-cake.png').convert('RGBA');cake.thumbnail((1100,1100))
    im.paste(cake,((W-cake.width)//2,600),cake)
    d=ImageDraw.Draw(im);d.text((100,1780),'生日蛋糕',font=font(142,True),fill=ink)
    d.text((102,1990),'送到幸福路八号',font=font(75),fill=ink)
    d.rounded_rectangle((100,2190,1100,2390),radius=70,fill=ink)
    d.text((408,2228),'已发送',font=font(90),fill='white')
    im.save(WORK/'phone-screen.png')
    return

if '--textures' in sys.argv:
    textures();sys.exit(0)

import bpy
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
layout=args[args.index('--layout')+1] if '--layout' in args else 'landscape'
draft='--draft' in args
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'

def mat(name,color,rough=.35,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
    return m
gold=mat('Champagne brushed metal',(.56,.41,.22),.24,.86)
teal=mat('Satin deep jade',(.018,.13,.14),.27,.5)
ivory=mat('Warm paper edge',(.92,.88,.77),.75)
black=mat('Keyhole dark inset',(.003,.014,.015),.8)
def cube(name,loc,size,m,bevel=.08):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Manufactured soft edge','BEVEL');b.width=bevel;b.segments=8
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o
def curve(name,coords,r,m):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=48;c.bevel_depth=r;c.bevel_resolution=6
    s=c.splines.new('BEZIER');s.bezier_points.add(len(coords)-1)
    for b,p in zip(s.bezier_points,coords):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.data.materials.append(m);return o
def parent_group(name,objects,loc,rot=(0,0,0),scale=1):
    e=bpy.data.objects.new(name,None);scene.collection.objects.link(e)
    for o in objects:o.parent=e
    e.location=loc;e.rotation_euler=rot;e.scale=(scale,)*3;return e
def texture_mat(name,path):
    m=mat(name,(1,1,1),.85)
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(path));b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    m.node_tree.links.new(n.outputs['Color'],b.inputs['Base Color'])
    b.inputs['Specular IOR Level'].default_value=.15
    # Keep the printed ink crisp at thumbnail size; grain is already in the raster.
    return m

def paper(name,kind,loc,rot,scale=1):
    # Genuine bent quadrilateral, smooth curl at free edges, full printed face UV.
    N,M=28,40;w,h=1.8,2.25;verts=[];faces=[]
    for j in range(M+1):
        v=j/M
        for i in range(N+1):
            u=i/N;x=(u-.5)*w;y=(v-.5)*h
            z=.08*math.sin(v*math.pi)+.18*(u-.5)**2+.12*v**8
            verts.append((x,y,z))
    for j in range(M):
        for i in range(N):
            a=j*(N+1)+i;faces.append((a,a+1,a+N+2,a+N+1))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o)
    uv=me.uv_layers.new()
    for p in me.polygons:
        p.use_smooth=True
        for li in p.loop_indices:
            vi=me.loops[li].vertex_index;uv.data[li].uv=(vi%(N+1)/N,vi//(N+1)/M)
    o.data.materials.append(texture_mat(name+' printed stock',WORK/(kind+'.png')));o.data.materials.append(ivory)
    sol=o.modifiers.new('Cotton paper thickness','SOLIDIFY');sol.thickness=.012;sol.material_offset=1
    bevel=o.modifiers.new('Soft paper edge','BEVEL');bevel.width=.004;bevel.segments=3
    o.location=loc;o.rotation_euler=rot;o.scale=(scale,)*3;return o

# Editable original product model from the finished film.
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/phone.glb'))
phoneobjs=list(set(bpy.data.objects)-before)
for o in phoneobjs:
    if o.name=='Screen' or o.name.startswith('Screen.'):
        m=texture_mat('Birthday order display',WORK/'phone-screen.png')
        b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');b.inputs['Roughness'].default_value=.24
        tex=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE');m.node_tree.links.new(tex.outputs['Color'],b.inputs['Emission Color']);b.inputs['Emission Strength'].default_value=.17
        o.data.materials.clear();o.data.materials.append(m)
phone=bpy.data.objects.new('Phone placement',None);scene.collection.objects.link(phone)
for o in phoneobjs:
    if not o.parent:o.parent=phone
phone.scale=(21,)*3

# Sculpted lock, rounded case and a physically curved stainless shackle.
lockparts=[]
lockparts.append(cube('Lock body',(0,0,.68),(1.60,.48,1.30),gold,.19))
lockparts.append(cube('Recessed jade face',(0,-.253,.68),(1.34,.045,1.06),teal,.15))
lockparts.append(curve('Shackle',[(-.48,0,1.20),(-.48,0,1.94),(-.32,0,2.20),(0,0,2.29),(.32,0,2.20),(.48,0,1.94),(.48,0,1.20)],.115,gold))
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=(0,-.282,.78));key=bpy.context.object;key.name='Keyhole upper';key.scale=(.11,.015,.11);key.data.materials.append(black);lockparts.append(key)
lockparts.append(cube('Keyhole stem',(0,-.283,.64),(.075,.025,.20),black,.025))
for o in lockparts:
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
lock=parent_group('Privacy metaphor lock',lockparts,(.55,.45,.3))
lock.scale=(1.12,)*3

if layout=='landscape':
    phone.location=(-2.60,.60,.25);phone.rotation_euler=(math.radians(5),math.radians(-10),math.radians(-19))
    order=paper('Readable plaintext order','order',(-1.05,-1.10,.35),(math.radians(10),math.radians(-9),math.radians(-15)),.87)
    cipher=paper('Encrypted order','cipher',(2.25,-1.10,.22),(math.radians(7),math.radians(7),math.radians(12)),1.06)
    lock.location=(.55,.70,.36);lock.rotation_euler.z=math.radians(-8)
    camera_loc=(7.4,-11.5,11.8);look=(0,0,.55);ortho=9.7
else:
    phone.location=(-1.05,2.20,.30);phone.rotation_euler=(math.radians(5),math.radians(-10),math.radians(-19))
    order=paper('Readable plaintext order','order',(-1.45,-.36,.31),(math.radians(10),math.radians(-9),math.radians(-15)),.86)
    cipher=paper('Encrypted order','cipher',(1.10,-1.67,.19),(math.radians(7),math.radians(7),math.radians(12)),1.04)
    lock.location=(.65,.50,.37);lock.rotation_euler.z=math.radians(-8)
    camera_loc=(7.4,-11.5,13.8);look=(0,.15,.45);ortho=8.5

# Three substantial data blocks only; no maze of lines or decorative device pile.
positions=[(-.29,-.48,.72),(.12,-.48,.78),(.53,-.48,.84)] if layout=='landscape' else [(-.45,.43,.75),(-.12,.24,.79),(.21,.05,.83)]
for i,p in enumerate(positions):
    o=cube('Data block %02d'%i,p,(.26,.26,.26),teal if i%2==0 else gold,.045);o.rotation_euler=(.15,.2,.25+i*.25)

# Test world-space surfaces, not projected bounding boxes: deliberate depth overlap
# is fine, physical penetration of the phone, paper and lock is not.
from mathutils.bvhtree import BVHTree
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
def bvh_group(objects):
    vertices=[];polygons=[]
    for obj in objects:
        if obj.type not in {'MESH','CURVE'}:continue
        ev=obj.evaluated_get(deps);me=ev.to_mesh();base=len(vertices)
        vertices.extend(ev.matrix_world@v.co for v in me.vertices)
        polygons.extend(tuple(base+i for i in p.vertices) for p in me.polygons)
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(vertices,polygons,all_triangles=False)
groups={'phone':bvh_group(phone.children_recursive),'lock':bvh_group(lock.children_recursive),'order':bvh_group([order]),'cipher':bvh_group([cipher])}
overlaps=[]
names=list(groups)
for i,a in enumerate(names):
    for b in names[i+1:]:
        count=len(groups[a].overlap(groups[b]))
        if count:overlaps.append({'a':a,'b':b,'intersectingTrianglePairs':count})
(WORK/(layout+'-geometry-qa.json')).write_text(json.dumps({'layout':layout,'surfaceIntersections':overlaps,'pass':not overlaps},indent=2),encoding='utf8')
print('GEOMETRY_QA',layout,overlaps)
if '--check-only' in args:sys.exit(0)

# An alpha shadow catcher lets the parent page place this over its exact warm background.
ground=cube('Studio shadow catcher',(0,0,-.08),(200,200,.1),mat('Shadow ground',(.9,.89,.86),.85),0)
ground.is_shadow_catcher=True
def light(name,loc,energy,size,color,shape='DISK',size_y=1):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape=shape;d.size=size;d.color=color
    if shape=='RECTANGLE':d.size_y=size_y
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.5))-o.location).to_track_quat('-Z','Y').to_euler()
light('Key softbox',(-4,-3,9),1100,6,(1,.94,.84),'RECTANGLE',7)
light('Cool fill',(5,-.5,5),650,5,(.79,.92,1),'RECTANGLE',7)
light('Champagne edge',(-1,6,6),1200,4,(1,.96,.86),'RECTANGLE',6)
world=bpy.data.worlds.new('Neutral studio');world.use_nodes=True;next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs['Color'].default_value=(.66,.72,.74,1);next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs['Strength'].default_value=.22;scene.world=world
bpy.ops.object.camera_add(location=camera_loc);cam=bpy.context.object;cam.name='Hero camera';cam.rotation_euler=(Vector(look)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=ortho
cam.data.dof.use_dof=True;cam.data.dof.focus_distance=(Vector(look)-cam.location).length;cam.data.dof.aperture_fstop=22
scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=24 if draft else 128;scene.cycles.use_denoising=True
try:
    pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='OPTIX';pref.get_devices()
    for d in pref.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU'
except:scene.cycles.device='CPU'
scene.render.resolution_x=900 if draft else 2000;scene.render.resolution_y=900 if draft else 2000;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='16' if not draft else '8'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.35
dest=(WORK if draft else OUT)/(layout+('-draft' if draft else '-hero')+'.png');scene.render.filepath=str(dest)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/(layout+'.blend')))
bpy.ops.render.render(write_still=True)
manifest={'layout':layout,'image':str(dest),'original_model':'public/models/phone.glb','original_texture':'public/textures/birthday-cake.png','script':'scripts/covers/build_cover_art.py','purpose':'Concept illustration: a padlock symbolizes message confidentiality, not protocol hardware.','engine':'Blender Cycles','samples':scene.cycles.samples,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
(WORK/(layout+'-manifest.json')).write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf8')
print('COVER_ART_DONE',dest)

