"""Reusable original crypto props. Blender Z-up -> glTF default Y-up, metres."""
import bpy, math, json, hashlib, struct
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/crypto_props.glb'
BLEND=ROOT/'work/models/crypto_props.blend'
PREVIEW=ROOT/'work/models/crypto_props_preview.png'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
def v(p): return (p[0],-p[2],p[1])
def material(name,color,metal=0,rough=.32):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    n=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if n is None:n=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    n.name='Principled BSDF'; n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
    return m
ivory=material('Ivory glazed ceramic',(.86,.85,.79),0,.22)
ink=material('Obsidian screen',(.009,.027,.029),.25,.17)
teal=material('Anodized teal',(.035,.21,.22),.65,.25)
gold=material('Brushed champagne brass',(.58,.34,.13),.78,.25)
steel=material('Satin aluminium',(.52,.57,.59),.85,.29)
dark=material('Graphite rubber',(.025,.032,.036),.15,.43)
wood=material('Warm pale oak',(.55,.35,.19),0,.5)
coffee=material('Roasted coffee',(.065,.018,.009),0,.16)
cake=material('Vanilla sponge',(.58,.34,.13),0,.55)
cream=material('Buttercream',(.96,.88,.68),0,.36)
red=material('Cherry',(.36,.018,.015),0,.19)
glow=material('Soft cyan display',(.19,.70,.64),.05,.23)
glow.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(.04,.25,.20,1)
glow.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.25
roots=[]
def group(name):
    o=bpy.data.objects.new(name,None); scene.collection.objects.link(o);roots.append(o);return o
def finish(o,name,mat,parent):
    o.name=name;o.data.materials.append(mat);o.parent=parent
    if o.type=='MESH':
        for f in o.data.polygons:f.use_smooth=True
    return o
def box(name,p,size,mat,parent,r=.006):
    bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if r:
        mod=o.modifiers.new('Machined rounded edges','BEVEL');mod.width=min(r,min(size)/2*.96);mod.segments=4
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return finish(o,name,mat,parent)
def ball(name,p,scale,mat,parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=v(p));o=bpy.context.object
    o.scale=(scale[0],scale[2],scale[1]);return finish(o,name,mat,parent)
def cylinder(name,p,r,depth,mat,parent,axis='y',verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=v(p));o=bpy.context.object
    if axis=='z':o.rotation_euler.x=math.pi/2
    elif axis=='x':o.rotation_euler.y=math.pi/2
    mod=o.modifiers.new('Soft rim','BEVEL');mod.width=min(.0015,depth*.15);mod.segments=3
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return finish(o,name,mat,parent)
def tube(name,points,r,mat,parent):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=1;c.bevel_depth=r;c.bevel_resolution=4
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for q,p in zip(s.points,points):q.co=(*v(p),1)
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);return finish(o,name,mat,parent)
def lathe(name,profile,mat,parent,segments=64):
    verts=[];faces=[]
    for radius,y in profile:
        for i in range(segments):
            a=i*math.tau/segments;verts.append(v((radius*math.cos(a),y,radius*math.sin(a))))
    for j in range(len(profile)-1):
        for i in range(segments):
            n=(i+1)%segments;a=j*segments+i;b=j*segments+n
            faces.append((a,b,b+segments,a+segments))
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);return finish(o,name,mat,parent)

# Independent front-facing phone with true separate glass, rails and lens.
g=group('Phone')
box('Phone aluminium chassis',(0,0,0),(.078,.160,.0088),teal,g,.006)
box('Phone screen surround',(0,0,.0045),(.074,.156,.0015),dark,g,.001)
box('Phone screen',(0,-.001,.0054),(.069,.147,.0005),ink,g,.0002)
box('Phone earpiece',(0,.071,.0059),(.016,.0018,.0006),steel,g,.0002)
ball('Phone camera',(.020,.070,.0058),(.0021,.0021,.0005),dark,g)
box('Phone volume control',(-.0396,.035,0),(.0018,.021,.004),steel,g,.0008)
box('Phone power button',(.0396,.024,0),(.0018,.016,.004),steel,g,.0008)
box('Phone gesture pill',(0,-.068,.0059),(.022,.0013,.0006),ivory,g,.0003)

# Small porcelain cup and saucer, real open inner surface rather than a solid cylinder.
g=group('CoffeeCup')
lathe('Cup ceramic wall',[(.028,.007),(.031,.011),(.036,.067),(.0365,.072),(.035,.075),(.032,.075),(.031,.071),(.027,.015),(.0,.015)],ivory,g)
lathe('Saucer',[(0,.003),(.035,.003),(.058,.005),(.066,.010),(.065,.013),(.058,.012),(.031,.007),(0,.007)],ivory,g)
cylinder('Coffee surface',(0,.065,0),.0304,.001,coffee,g)
pts=[(.034+.022*math.sin(a),.040+.023*math.cos(a),0) for a in [i*math.pi/32 for i in range(33)]]
tube('Cup handle',pts,.0055,ivory,g)
lathe('Coffee meniscus',[(.028,.0655),(.0305,.0655),(.0307,.067)],coffee,g)

g=group('Cake')
cylinder('Cake plate',(0,.003,0),.060,.006,ivory,g)
cylinder('Sponge lower',(0,.017,0),.040,.020,cake,g)
cylinder('Cream centre',(0,.029,0),.041,.005,cream,g)
cylinder('Sponge upper',(0,.042,0),.040,.020,cake,g)
cylinder('Cream top',(0,.054,0),.041,.005,cream,g)
for i in range(10):
    a=i*math.tau/10;ball('Cream rosette %02d'%i,(.030*math.cos(a),.060,.030*math.sin(a)),(.008,.006,.008),cream,g)
ball('Cherry',(0,.068,0),(.010,.010,.010),red,g)
tube('Cherry stem',[(0,.074,0),(.002,.086,0),(.007,.090,.002)],.0012,teal,g)

g=group('Laptop')
box('Laptop bottom',(0,0,.055),(.31,.013,.22),steel,g,.005)
box('Laptop keyboard well',(0,.0075,.014),(.278,.001,.106),dark,g,.0004)
for row in range(5):
    for col in range(12):
        box('Key %02d %02d'%(row,col),(-.126+col*.023,.009,-.027+row*.019),(.019,.003,.014),dark,g,.001)
box('Spacebar',(0,.010,.062),(.10,.003,.013),dark,g,.001)
box('Trackpad',(0,.0077,.110),(.096,.001,.050),steel,g,.0003)
cylinder('Laptop hinge',(0,.012,-.051),.010,.285,steel,g,axis='x')
box('Laptop screen shell',(0,.111,-.060),(.31,.203,.010),steel,g,.004)
box('Laptop bezel',(0,.111,-.0544),(.296,.189,.001),dark,g,.0003)
box('Laptop screen',(0,.113,-.0537),(.278,.165,.0004),ink,g,.0001)
ball('Laptop webcam',(0,.199,-.0535),(.0018,.0018,.0005),dark,g)

g=group('Gateway')
box('Gateway housing',(0,.105,0),(.17,.21,.075),ivory,g,.026)
box('Gateway inset',(0,.105,.0385),(.137,.176,.003),teal,g,.001)
box('Gateway center light',(0,.108,.0403),(.014,.075,.001),glow,g,.0004)
for y in [.05,.075,.10,.125,.15]:
    box('Gateway ventilation',(-.045,y,.0405),(.016,.003,.001),dark,g,.0004)
for x in [-.043,0,.043]:
    box('Gateway ethernet',(x,.025,.0403),(.028,.017,.0016),dark,g,.0004)
    box('Gateway port inner',(x,.025,.0412),(.022,.009,.0006),gold,g,.0002)
box('Gateway pedestal',(0,.006,0),(.20,.012,.10),steel,g,.006)

g=group('LockBody')
box('Lock brass body',(0,0,0),(.140,.115,.055),gold,g,.012)
box('Lock face inset',(0,0,.028),(.116,.088,.002),teal,g,.0008)
cylinder('Lock key cylinder',(0,-.010,.030),.019,.003,steel,g,axis='z')
cylinder('Lock key hole',(0,-.006,.032),.006,.0015,dark,g,axis='z')
box('Lock key stem',(0,-.016,.032),(.007,.016,.0015),dark,g,.0007)
for x in [-.049,.049]:
    cylinder('Lock shackle socket',(x,.057,0),.012,.002,dark,g)
g=group('LockShackle')
pts=[(-.049,-.001,0),(-.049,.090,0)]
pts += [(.049*math.cos(a),.090+.049*math.sin(a),0) for a in [math.pi-i*math.pi/40 for i in range(41)]]
pts +=[(.049,-.001,0)]
tube('Hardened steel shackle',pts,.010,steel,g)

g=group('Capsule')
box('Capsule main',(0,0,0),(.12,.055,.055),teal,g,.021)
box('Capsule gold seam',(0,0,0),(.006,.057,.057),gold,g,.002)
box('Capsule display',(.025,0,.0276),(.036,.021,.0012),ink,g,.0005)
box('Capsule display glow',(.025,0,.0284),(.020,.004,.0006),glow,g,.0002)

g=group('CafeTable')
box('CafeTable solid oak',(0,-.022,0),(1.35,.044,.80),wood,g,.018)
box('CafeTable lower shadow',(0,-.048,0),(1.29,.012,.74),teal,g,.006)

# Build assets in neutral local coordinates, then arrange only for source-file preview.
placements={'CafeTable':(0,0,0),'Phone':(-.37,.087,.11),'CoffeeCup':(.38,.001,.12),'Cake':(.41,.001,-.13),'Laptop':(-.05,.007,-.16),'Gateway':(-.49,.001,-.22),'LockBody':(.20,.064,.20),'LockShackle':(.20,.121,.20),'Capsule':(.21,.037,-.10)}
for g in roots:g.location=v(placements[g.name])
bpy.context.view_layer.update()
model_meta=[]
for g in roots:
    pts=[]
    for c in g.children_recursive:
        if c.type in {'MESH','CURVE'}:
            for p in c.bound_box:
                a=g.matrix_world.inverted()@c.matrix_world@Vector(p);pts.append((a.x,a.z,-a.y))
    if pts:
        lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
        model_meta.append({'name':g.name,'position_xyz_m':placements[g.name],'bounds_local_min_m':lo,'bounds_local_max_m':hi,'dimensions_m':[hi[i]-lo[i] for i in range(3)]})

# Standard glTF default axis conversion preserves declared Three.js local frames.
bpy.ops.object.select_all(action='DESELECT')
for g in roots:
    g.select_set(True)
    for c in g.children_recursive:c.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False)

# Source .blend includes a well-lit representative frame; lights/camera are excluded from GLB.
def area(name,p,power,size,color,target=(0,.04,0)):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=v(p)
    o.rotation_euler=(Vector(v(target))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large warm window',(-.7,1.1,.65),110,1.1,(1,.89,.74))
area('Cool fill',(.8,.70,.15),65,1.0,(.74,.91,1))
area('Soft back edge',(0,.7,-.9),70,.65,(1,.94,.83))
floor=box('Preview floor',(0,-.071,0),(200,.012,200),ivory,None,.001)
camd=bpy.data.cameras.new('PreviewCamera');cam=bpy.data.objects.new('PreviewCamera',camd);scene.collection.objects.link(cam)
cam.location=v((1.0,1.10,1.38));target=Vector(v((0,.05,0)));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camd.lens=48;scene.camera=cam
scene.world.color=(.20,.23,.23)
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW)
scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.render.render(write_still=True)
hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [OUT,BLEND,PREVIEW,Path(__file__)]}
glb=OUT.read_bytes(); chunk_len=struct.unpack_from('<I',glb,12)[0]; gj=json.loads(glb[20:20+chunk_len])
triangles=sum(gj['accessors'][p['indices']]['count']//3 for m in gj['meshes'] for p in m['primitives'])
manifest={'asset':'crypto_props','version':1,'tool':'Blender '+bpy.app.version_string,'source':'Original procedural geometry generated by scripts/build_props.py for rainbow鱼 cryptography episode','license':'Original project-generated assets; no third-party textures or meshes','unit':'metre','coordinates':'glTF Y-up, right-handed; phone and laptop screen face +Z','export':'default glTF Y-up conversion from Blender Z-up','usage':'getObjectByName(name).clone(true); set position to desired placement; keep child transforms; LockShackle may animate independently; closed shackle position is body position plus (0,0.057,0)','objects':model_meta,'hashes_sha256':hashes,'validation':{'glb_exists':OUT.exists(),'glb_bytes':OUT.stat().st_size,'source_objects':len(roots),'triangles':triangles,'meshes':len(gj['meshes']),'external_images':len(gj.get('images',[])),'preview':str(PREVIEW),'render_engine':'Cycles, 32 samples, denoised'}}
(ROOT/'docs/asset_provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('CRYPTO_ASSETS_READY '+json.dumps({'glb':str(OUT),'objects':len(roots),'bytes':OUT.stat().st_size,'preview':str(PREVIEW)}))
