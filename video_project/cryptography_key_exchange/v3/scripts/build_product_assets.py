"""Original, dimensioned product props. Run with the user's Blender 4/5 executable."""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
TEX=ROOT/'public/textures'; OUT=ROOT/'public/models'; WORK=ROOT/'work/models'
OUT.mkdir(parents=True,exist_ok=True); WORK.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for datablock in bpy.data.materials: bpy.data.materials.remove(datablock)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1

def material(name,color,rough=.4,metal=0,color_tex=None,rough_tex=None,normal_tex=None,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    if emission: bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emission
    for file,target,space in [(color_tex,'Base Color','sRGB'),(rough_tex,'Roughness','Non-Color')]:
        if file:
            n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(TEX/file),check_existing=True);n.image.colorspace_settings.name=space
            m.node_tree.links.new(n.outputs['Color'],bs.inputs[target])
    if normal_tex:
        n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(TEX/normal_tex),check_existing=True);n.image.colorspace_settings.name='Non-Color'
        normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35
        m.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    return m

ivory=material('Ceramic · warm ivory',(0.83,.81,.74),.3,rough_tex='ceramic_rough.png',normal_tex='ceramic_normal.png')
white=material('Powder coat · warm white',(.82,.84,.82),.45,rough_tex='plastic_rough.png')
ink=material('Anodized deep ink',(.019,.035,.05),.35,.62,rough_tex='metal_rough.png',normal_tex='metal_normal.png')
metal=material('Brushed aluminum',(.46,.51,.53),.3,.93,rough_tex='metal_rough.png',normal_tex='metal_normal.png')
gold=material('Brushed champagne',(.52,.39,.23),.3,.85,rough_tex='metal_rough.png')
rubber=material('Graphite silicone',(.009,.013,.015),.78)
black=material('Lens black',(.003,.006,.009),.19,.12)
glass=material('Polished front glass',(.008,.018,.025),.13,.18)
teal=material('Turquoise indicator',(.06,.55,.42),.23,.25,emission=1.3)
wood=material('White oak veneer · CC0 Poly Haven',(1,1,1),.55,color_tex='oak_color.jpg',rough_tex='oak_rough.jpg',normal_tex='oak_normal.jpg')
coffee=material('Coffee crema',(.23,.10,.035),.25,color_tex='coffee_color.jpg',rough_tex='coffee_rough.png')
screenmat=material('Screen display · replaceable',(.9,.97,.94),.45,color_tex='screen_placeholder.png')
bs=next(n for n in screenmat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Emission Strength'].default_value=.25
screenmat.node_tree.links.new(next(n for n in screenmat.node_tree.nodes if n.type=='TEX_IMAGE').outputs['Color'],bs.inputs['Emission Color'])

roots=[]
def root(name):
    obj=bpy.data.objects.new(name,None);scene.collection.objects.link(obj);roots.append(obj)
    obj['units']='metres';obj['creator']='rainbow鱼 · original procedural asset';obj['version']='3.0';return obj
def parent(o,p,mat=None):
    o.parent=p
    if mat:o.data.materials.append(mat)
    return o
def smooth(o):
    for p in o.data.polygons:p.use_smooth=True
def cube(name,loc,dims,mat,p,bevel=.001,segments=4):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('Machined edge radius','BEVEL');b.width=bevel;b.segments=segments
        n=o.modifiers.new('Planar weighted normals','WEIGHTED_NORMAL');n.keep_sharp=True
    return parent(o,p,mat)
def cyl(name,loc,r,depth,mat,p,verts=64,rot=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=loc);o=bpy.context.object;o.name=name
    if rot:o.rotation_euler=rot
    b=o.modifiers.new('Fine rim bevel','BEVEL');b.width=min(depth/6,r*.06);b.segments=3
    smooth(o);o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return parent(o,p,mat)
def sphere(name,loc,scale,mat,p):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;smooth(o);return parent(o,p,mat)
def curve(name,coords,radius,mat,p,cyclic=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=20;c.bevel_depth=radius;c.bevel_resolution=5
    s=c.splines.new('BEZIER');s.bezier_points.add(len(coords)-1)
    for b,v in zip(s.bezier_points,coords):b.co=v;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    s.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);return parent(o,p,mat)
def rounded(name,w,l,h,z,r,mat,p):
    # A rounded planform with its own small edge profile: corner radius need not equal thickness.
    verts=[];faces=[];corner=16
    edge=min(h*.24,.0009)
    for iz,(zz,inset) in enumerate([(z,edge),(z+edge*.3,edge*.35),(z+edge,0),(z+h-edge,0),(z+h-edge*.3,edge*.35),(z+h,edge)]):
        for cx,cy,a in [(w/2-r,l/2-r,0),(-w/2+r,l/2-r,90),(-w/2+r,-l/2+r,180),(w/2-r,-l/2+r,270)]:
            for j in range(corner):
                q=math.radians(a+j*90/(corner-1));verts.append((cx+(r-inset)*math.cos(q),cy+(r-inset)*math.sin(q),zz))
    n=corner*4
    for k in range(5):
        for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    faces += [tuple(reversed(range(n))),tuple(range(n*5,n*6))]
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);parent(o,p,mat)
    for po in me.polygons:po.use_smooth=len(po.vertices)==4
    uv=me.uv_layers.new(name='Product UV')
    for po in me.polygons:
        for li in po.loop_indices:
            co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co.x/w+.5,co.y/l+.5)
    return o
def lathe(name,profile,mat,p,N=128):
    v=[];f=[]
    for r,z in profile:
        for i in range(N):a=i*2*math.pi/N;v.append((r*math.cos(a),r*math.sin(a),z))
    for j in range(len(profile)-1):
        for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);parent(o,p,mat);smooth(o)
    uv=me.uv_layers.new()
    for po in me.polygons:
        for li in po.loop_indices:
            vi=me.loops[li].vertex_index;uv.data[li].uv=(vi%N/N,vi//N/(len(profile)-1))
    return o

phone=root('Phone')
rounded('PhoneBody',.075,.155,.008,0,.010,ink,phone)
rounded('GlassFront',.0722,.152,.00065,.0081,.009,glass,phone)
screen=rounded('Screen',.0678,.144,.00012,.00886,.0075,screenmat,phone)
screen['replaceable']='CanvasTexture. UV top corresponds phone +local Y in Blender / -Z in Three; flipY=false.'
rounded('EarSpeaker',.014,.0014,.00017,.00903,.00065,black,phone).location.y=.0668
cyl('FrontCameraLens',(.010,.064,.0091),.0014,.0002,black,phone,48)
sphere('LensGlint',(.0104,.0637,.00922),(.00025,.00025,.00003),teal,phone)
for yy in [.027,.009]:cube('VolumeButton',( -.03775,yy,.0046),(.00085,.012,.0023),metal,phone,.0005)
cube('PowerButton',(.03775,.024,.0046),(.00085,.021,.0023),metal,phone,.0005)
cube('USBC_Recess',(0,-.0776,.004),(.009,.0006,.003),black,phone,.001)
cube('USBC_Tongue',(0,-.07795,.004),(.0064,.0003,.0007),metal,phone,.0002)
for i in range(6):
    for side in [-1,1]:cyl('SpeakerHole',((.015+i*.0026)*side,-.0776,.004),.0006,.0003,black,phone,16,(math.pi/2,0,0))
for x in [-.022,.022]:
    for y in [-.05,.05]:cube('AntennaBreak',(x,y,.004),(.0004,.0008,.007),white,phone,.0001)
phone['dimensions_design_m']=[.075,.155,.0092]

cup=root('Cup')
lathe('CeramicCup',[(.021,0),(.026,.001),(.029,.004),(.031,.012),(.036,.045),(.041,.077),(.0408,.081),(.0394,.082),(.038,.080),(.035,.056),(.030,.019),(.025,.010),(.0,.010)],ivory,cup)
lathe('FootRing',[(.023,.0004),(.024,.001),(.024,.003),(.023,.0035)],ivory,cup)
curve('CupHandle',[(.035,0,.065),(.060,0,.069),(.066,0,.051),(.056,0,.031),(.033,0,.025)],.0055,ivory,cup)
cyl('CoffeeSurface',(0,0,.075),.037,.00065,coffee,cup,128)
# Re-map top coffee surface as a single orthographic image.
o=bpy.data.objects['CoffeeSurface'];uv=o.data.uv_layers.active
for poly in o.data.polygons:
    for li in poly.loop_indices:
        co=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(co.x/.074+.5,co.y/.074+.5)
lathe('Saucer',[(0,-.003),(.040,-.003),(.064,-.001),(.070,.003),(.069,.006),(.060,.006),(.035,.002),(0,.001)],ivory,cup)
cup['dimensions_design_m']=[.14,.14,.085]

table=root('Table')
top=cube('SolidOakTop',(0,0,-.017),(1.25,.72,.034),wood,table,.018,8)
# Box projection at a realistic 0.5 m source texture scale.
uv=top.data.uv_layers.active
for poly in top.data.polygons:
    for li in poly.loop_indices:
        c=top.data.vertices[top.data.loops[li].vertex_index].co
        uv.data[li].uv=(c.x/.5+.5,c.y/.5+.5) if abs(poly.normal.z)>.5 else ((c.x+c.y)/.5+.5,c.z/.5+.5)
for x in [-.48,.48]:
    for y in [-.24,.24]:
        leg=cube('OakLeg',(x,y,-.37),(.045,.045,.69),wood,table,.008,6)
        leg.rotation_euler=(y*.1,-x*.05,0)
table['top_y_three']=0

router=root('Router')
rounded('RouterBase',.182,.122,.008,0,.019,rubber,router)
rounded('RouterShell',.18,.12,.031,.006,.021,white,router)
rounded('RouterTopInset',.163,.103,.0007,.037,.016,white,router)
for xx in [-.060,.060]:
    a=cyl('AntennaStem',(xx,.044,.070),.0045,.10,white,router,48)
    a.rotation_euler.y=xx*.9
    sphere('AntennaTop',(xx+math.sin(xx*.9)*.05,.044,.120),(.0045,.0045,.0045),white,router)
    cyl('AntennaSwivel',(xx,.044,.025),.009,.016,metal,router,48,(math.pi/2,0,0))
for j in range(4):
    xx=-.046+j*.029
    cube('RJ45MetalFrame',(xx,-.0602,.022),(.023,.002,.014),metal,router,.0012)
    cube('RJ45Socket',(xx,-.0614,.022),(.018,.001,.010),black,router,.0007)
    for k in range(8):cube('RJ45GoldContact',(xx-.006+k*.0017,-.0620,.023),(.0005,.0002,.004),gold,router,.0001)
for i in range(5):sphere('StatusLED',(-.022+i*.011,-.043,.038),(.0017,.0017,.0005),teal,router)
for j in range(18):cube('VentGroove',(-.068+j*.008,-.000,.0377),(.0017,.047,.00025),rubber,router,.0003)
for x in [-.06,.06]:
    for y in [-.04,.04]:cyl('SiliconeFoot',(x,y,-.001),.007,.003,rubber,router,32)
router['dimensions_design_m']=[.182,.124,.126]

server=root('Server')
cube('ServerChassis',(0,0,.18),(.22,.30,.36),ink,server,.007,5)
cube('FrontRecess',(0,-.151,.18),(.203,.006,.335),black,server,.004)
for xx in [-.105,.105]:cube('FrontRail',(xx,-.158,.18),(.012,.008,.34),metal,server,.002)
# Perforated front panel: actual open holes, no painted dots.
verts=[];faces=[]
for iz in range(22):
    for ix in range(12):
        cx=(ix-5.5)*.014;cz=.065+iz*.0118;r=.0032
        base=len(verts)
        for rr in [0,1]:
            for k in range(12):
                a=k*math.pi/6;ca=math.cos(a);sa=math.sin(a)
                rad=r if rr==0 else min(.007/max(abs(ca),1e-8),.0059/max(abs(sa),1e-8))
                verts.append((cx+rad*ca,-.159,cz+rad*sa))
        for k in range(12):faces.append((base+k,base+(k+1)%12,base+12+(k+1)%12,base+12+k))
me=bpy.data.meshes.new('PerforatedAluminum');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('PerforatedAluminum',me);scene.collection.objects.link(o);parent(o,server,metal)
for z in [.12,.235]:
    cyl('FanHub',(0,-.154,z),.023,.002,black,server,64,(math.pi/2,0,0))
    for k in range(7):
        a=k*2*math.pi/7
        blade=cube('FanBlade',(.036*math.cos(a),-.153,z+.036*math.sin(a)),(.033,.002,.012),ink,server,.004,4);blade.rotation_euler.y=-a+.3
for xx in [-.097,.097]:
    for zz in [.03,.33]:
        cyl('HexScrew',(xx,-.164,zz),.0025,.002,metal,server,6,(math.pi/2,0,0))
cube('TopControlStrip',(0,-.161,.339),(.171,.003,.016),ink,server,.002)
sphere('PowerIndicator',(.067,-.164,.339),(.003,.0007,.003),teal,server)
for j in range(2):cube('USBFront',(-.056+j*.026,-.164,.339),(.016,.001,.006),black,server,.0007)
for xx in [-.077,.077]:
    for yy in [-.10,.10]:cyl('ServerRubberFoot',(xx,yy,-.002),.013,.006,rubber,server,32)
server['dimensions_design_m']=[.22,.318,.366]

bg=root('CafeBackground')
wall=material('Limewash cream',(.72,.72,.65),.9)
cube('BackWall',(0,.9,.75),(2.8,.06,1.7),wall,bg,.01)
for x in [-.95,-.10,.75]:
    cube('WindowFrameVertical',(x,.84,.85),(.034,.10,1.55),metal,bg,.004)
cube('WindowSill',(0,.80,.12),(2.5,.21,.035),wood,bg,.008)
for x in [-.93,-.08,.77]:
    cube('WindowPane',(x+.39,.87,.85),(.75,.02,1.46),material('Frosted daylight '+str(x),(.77,.88,.87),.7,emission=.25),bg,.003)

# Export each independent item at its origin. Props are not pre-lit.
manifest={'version':'3.0','units':'metres','blenderUp':'Z','gltfUp':'Y','author':'rainbow鱼 / original procedural modeling','license':'Original project meshes; white oak maps CC0 from Poly Haven','assets':[]}
def members(r):return [r]+list(r.children_recursive)
def export(r,path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in members(r):o.select_set(True)
    bpy.context.view_layer.objects.active=r
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_materials='EXPORT')
for r in roots:
    path=OUT/(r.name.lower()+'.glb');export(r,path)
    manifest['assets'].append({'name':r.name,'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'nodes':[o.name for o in members(r)],'units':'metres'})

# Compose the same props for low-cost product-lighting evidence.
phone.location=(-.085,-.05,.001);phone.rotation_euler.z=math.radians(-12)
cup.location=(.14,.12,.004)
router.location=(-.30,.20,.003);router.rotation_euler.z=math.radians(8)
server.location=(.40,.40,0);server.rotation_euler.z=math.radians(-15)
server.hide_render=True
for o in server.children_recursive:o.hide_render=True
def light(name,loc,energy,size,color,target):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();return obj
light('Window soft key',(-.55,-.12,1.1),55,.8,(1,.94,.84),(0,0,0))
light('Large cool fill',(.50,.30,.75),25,.9,(.78,.90,1),(0,0,0))
light('Top strip',(-.10,.6,.9),45,.45,(1,1,1),(0,0,0))
scene.world.color=(.18,.18,.18)
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.cycles.device='CPU'
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
bpy.ops.object.camera_add(location=(.29,-.40,.37));cam=bpy.context.object;cam.name='ProductEvidenceCamera';scene.camera=cam;cam.data.lens=52
cam.data.clip_start=.002;cam.data.clip_end=100;cam.data.dof.use_dof=True;cam.data.dof.aperture_fstop=5.6
def render(name,pos,target,lens=52,fstop=5.6):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;cam.data.dof.focus_distance=(Vector(target)-cam.location).length;cam.data.dof.aperture_fstop=fstop
    scene.render.filepath=str(WORK/(name+'.png'));bpy.ops.render.render(write_still=True)
for im in bpy.data.images:
    if im.source=='FILE':im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'cryptography_product_assets.blend'))
render('cafe_hero',(.29,-.40,.37),(-.025,.04,.025),52,6.3)
render('phone_macro',(.08,-.25,.23),(-.085,-.05,.006),64,8)
render('router_detail',(-.12,-.08,.15),(-.30,.20,.044),65,8)
for r in roots:
    for o in members(r):o.hide_render=r is not server
for o in members(server):o.hide_render=False
server.location=(0,0,.003);server.rotation_euler.z=0
# Add a smooth studio pedestal for the isolated server closeup.
pedestal=cube('EvidencePedestal',(0,0,-.011),(.65,.65,.020),white,None,.012,6)
render('server_detail',(.47,-.72,.40),(0,0,.18),43,8)
manifest['evidenceRenders']=['cafe_hero.png','phone_macro.png','router_detail.png','server_detail.png']
manifest['blendPath']='work/models/cryptography_product_assets.blend'
manifest['blendSha256']=hashlib.sha256((WORK/'cryptography_product_assets.blend').read_bytes()).hexdigest()
(ROOT/'docs/models-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('CRYPTO_V3_PRODUCT_ASSETS_COMPLETE')
