"""Native-node-derived, clean Blender endpoint frames for conceptual WAN bridges.

Nothing here is solver output: native hull geometry is preserved; display skins,
water, grid and evidence choreography are editorial. Run with D:/blender/blender.exe.
"""
from pathlib import Path
import bpy, json, math, hashlib
from mathutils import Vector

R=Path(__file__).resolve().parents[1]
OUT=R/'public/generated/v4'; OUT.mkdir(parents=True,exist_ok=True)
MODEL=R/'public/beso-research/physics/native-model.json'
data=json.loads(MODEL.read_text('utf8'))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24;scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type!='CPU'
    scene.cycles.device='GPU'
except Exception:pass
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-3.0
scene.render.film_transparent=False

def mat(name,color,metal=.15,rough=.3):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
steel=mat('Native marine steel',(0.13,.38,.43),.55,.28)
legmat=mat('Secondary member blue',(0.1,.26,.31),.62,.32)
white=mat('Warm white turbine skin',(.7,.78,.77),.22,.29)
dark=mat('Weld and flange',(.04,.12,.15),.6,.32)
floor=mat('Paper studio',(.87,.9,.87),0,.7)
paper=mat('Ivory report paper',(.9,.92,.88),0,.65)
parts=[];towerparts=[];cables=[]

def finish(o,m,bevel=0):
    o.data.materials.append(m)
    if bevel:
        mo=o.modifiers.new('Machined edge','BEVEL');mo.width=bevel;mo.segments=3
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
    return o
def tube(name,a,b,r,m,group=parts):
    a,b=Vector(a),Vector(b);v=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=72,radius=r,depth=v.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
    finish(o,m,.15);group.append(o);return o
def curve(name,points,rad,m,group=cables):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=rad;c.bevel_resolution=3
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.data.materials.append(m);group.append(o);return o
for el in data['elements']:
    a=Vector(data['nodes'][str(el['from'])]);b=Vector(data['nodes'][str(el['to'])]);v=b-a
    if el.get('diameterM'):
        tube('Native '+str(el['id'])+' '+el['role'],a,b,el['diameterM']/2,steel if el['role']=='outer_column' else legmat)
        if el['role']=='outer_column':
            # End flange and railing are display details only, attached to true axis.
            q=v.to_track_quat('Z','Y')
            bpy.ops.mesh.primitive_torus_add(major_radius=el['diameterM']/2-.5,minor_radius=.09,location=a+v.normalized()*.25)
            o=bpy.context.object;o.rotation_euler=q.to_euler();finish(o,dark);parts.append(o)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)/2);o=bpy.context.object;o.name='Native radial beam '+str(el['id'])
        o.dimensions=(el['widthM'],el['heightM'],v.length);o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,white,.22);parts.append(o)
tube('Native centre hub',(0,0,12-2.2165),(0,0,12+2.2165),12,white)
# Native tower endpoints, display taper and nacelle.
bpy.ops.mesh.primitive_cone_add(vertices=96,radius1=5.35,radius2=3.1,depth=data['tower']['lengthM'],location=(0,0,12+data['tower']['lengthM']/2))
o=bpy.context.object;o.name='Tower display skin / native endpoint';finish(o,white,.1);towerparts.append(o)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,150.45));o=bpy.context.object;o.name='Nacelle display skin';o.dimensions=(17,8.5,8)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,white,2.1);towerparts.append(o)
rotor_origin=Vector((-9.5,0,data['rotor']['hubZM']))
tube('Rotor hub display skin',rotor_origin+Vector((-3,0,0)),rotor_origin+Vector((3,0,0)),3.9,white,towerparts)
for j in range(3):
    theta=j*math.tau/3+.24;verts=[];faces=[];L=data['rotor']['bladeLengthM']
    for i in range(42):
        u=i/41;r=3.2+u*(L-3.2);width=6.7*(1-u)**.65*(.63+.5*math.sin(u*math.pi))+.09
        # Airfoil skin; illustrative aerodynamic surface around native blade span.
        for k in range(12):
            a=k*math.tau/12;y=width*.5*math.cos(a);x=width*.09*math.sin(a)
            tang=Vector((0,math.cos(theta),-math.sin(theta)))
            radial=Vector((0,math.sin(theta),math.cos(theta)))
            co=rotor_origin+radial*r+tang*y+Vector((x-u*u*6,0,0));verts.append(co)
    for i in range(41):
        for k in range(12):faces.append((i*12+k,i*12+(k+1)%12,(i+1)*12+(k+1)%12,(i+1)*12+k))
    me=bpy.data.meshes.new('Blade skin');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Blade '+str(j+1)+' display skin',me);scene.collection.objects.link(o);finish(o,white);towerparts.append(o)
for mooring in data['mooringPolylines']:curve('Native mooring '+str(mooring['line']),mooring['nativeXYZ'],.25,dark)

world=bpy.data.worlds.new('Sky environment');scene.world=world;world.use_nodes=True
nt=world.node_tree;nt.nodes.clear();sky=nt.nodes.new('ShaderNodeTexSky');sky.sky_type='MULTIPLE_SCATTERING';sky.sun_elevation=math.radians(24);sky.sun_rotation=math.radians(125);sky.air_density=1.25
bg=nt.nodes.new('ShaderNodeBackground');bg.inputs['Strength'].default_value=.65;out=nt.nodes.new('ShaderNodeOutputWorld');nt.links.new(sky.outputs[0],bg.inputs[0]);nt.links.new(bg.outputs[0],out.inputs[0])
bpy.ops.object.light_add(type='AREA',location=(80,-120,210));light=bpy.context.object;light.data.energy=2600000;light.data.shape='DISK';light.data.size=170

bpy.ops.mesh.primitive_plane_add(size=12000,location=(0,0,-.25));sea=bpy.context.object;sea.name='Visual ocean / not response solver'
water=mat('Visual wave water',(.02,.12,.17),.35,.14);water.use_nodes=True;p=water.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=.3;p.inputs['IOR'].default_value=1.333
n=water.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=2500;n.inputs['Detail'].default_value=5;n.inputs['Roughness'].default_value=.67
tex=water.node_tree.nodes.new('ShaderNodeTexCoord');water.node_tree.links.new(tex.outputs['Generated'],n.inputs['Vector'])
bump=water.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.38;bump.inputs['Distance'].default_value=1.2;water.node_tree.links.new(n.outputs['Fac'],bump.inputs['Height']);water.node_tree.links.new(bump.outputs[0],p.inputs['Normal']);finish(sea,water)
bpy.ops.mesh.primitive_plane_add(size=3000,location=(0,0,-18));studio=bpy.context.object;studio.name='Ivory studio';finish(studio,floor);studio.hide_render=True

bpy.ops.object.camera_add(location=(350,-470,240));cam=bpy.context.object;scene.camera=cam;cam.data.lens=46
def aim(pos,target,lens):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
def render(name,pos,target,lens,ocean=True,tower=True):
    sea.hide_render=not ocean;studio.hide_render=ocean
    for o in towerparts:o.hide_render=not tower
    for o in cables:o.hide_render=not ocean
    sky.sun_elevation=math.radians(24 if ocean else 55);bg.inputs['Strength'].default_value=.65 if ocean else .8
    aim(pos,target,lens);scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
render('ocean-wide.png',(420,-680,260),(0,0,136),40)
render('ocean-close.png',(180,-240,98),(0,0,35),50)
render('studio-solid.png',(160,-195,157),(0,0,12),52,False,False)
# Wireframe design-domain concept uses the same native topology and exact pose.
for o in parts:
    if o.type=='MESH':
        o.data.materials.clear();o.data.materials.append(legmat)
        mod=o.modifiers.new('Concept wireframe','WIREFRAME');mod.thickness=.12;mod.use_replace=True
render('studio-wire.png',(160,-195,157),(0,0,12),52,False,False)
for o in parts:
    if o.type=='MESH':
        for mod in list(o.modifiers):
            if mod.type=='WIREFRAME':o.modifiers.remove(mod)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'native-endpoints.blend'))
record={'modelSource':str(MODEL),'modelSHA256':hashlib.sha256(MODEL.read_bytes()).hexdigest(),'nativeElements':len(data['elements']),'nativeMoorings':len(data['mooringPolylines']),'endpointType':'Native-node-derived hull; tower, blades, water and wireframe are editorial display skins; no numerical data generated','frames':[]}
for p in OUT.glob('*.png'):record['frames'].append({'file':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(R/'research/generation/v4-endpoint-provenance.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf8')
print('V4_ENDPOINTS_DONE')
