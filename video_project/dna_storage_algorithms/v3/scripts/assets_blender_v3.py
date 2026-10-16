"""Deterministic, precisely named product assets for the DNA film. Blender 5.x."""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/3d'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1440;scene.render.resolution_y=810;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
COL=None

def material(name,color,metal=0,rough=.32,alpha=1,trans=0,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,alpha)
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,alpha)
    n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal;n.inputs['Alpha'].default_value=alpha
    n.inputs['Transmission Weight'].default_value=trans;n.inputs['IOR'].default_value=1.46
    n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
    if alpha<1:m.surface_render_method='DITHERED'
    return m
M={
 'pearl':material('MAT_pearl_ceramic',(.76,.81,.79),.15,.24),
 'white':material('MAT_warm_porcelain',(.89,.87,.82),.04,.30),
 'graphite':material('MAT_graphite_anodized',(.021,.038,.043),.62,.26),
 'dark':material('MAT_soft_black',(.008,.016,.021),.05,.30),
 'gold':material('MAT_satin_champagne',(.63,.43,.20),.78,.25),
 'glass':material('MAT_teal_optical_glass',(.67,.89,.88),.02,.13,.32,.78),
 'clear':material('MAT_clear_cover',(.80,.94,.94),.02,.08,.19,.87),
 'liquid':material('MAT_aqua_liquid',(.10,.49,.49),.02,.17,.78,.4),
 'teal':material('MAT_teal_microchannel',(.06,.42,.43),.22,.26),
 'light':material('MAT_ice_indicator',(.30,.83,.78),.08,.22,1,0,.65),
 'screen':material('MAT_replaceable_screen',(.025,.080,.10),.05,.25),
 'backdrop':material('MAT_seamless_background',(.82,.84,.80),0,.63),
}
ASSETS={}
def new_asset(name):
    global COL
    COL=bpy.data.collections.new(name);scene.collection.children.link(COL);ASSETS[name]=COL
    return COL
def assign(obj,name,mat):
    obj.name=name
    for c in list(obj.users_collection):c.objects.unlink(obj)
    COL.objects.link(obj)
    obj.data.materials.append(M[mat]);obj['source']='procedural Blender, DNA V3';obj['units']='meter'
    return obj
def bevel(o,width=.001,segments=4):
    b=o.modifiers.new('Manufactured_edge_radius','BEVEL');b.width=width;b.segments=segments
    n=o.modifiers.new('Weighted_corner_normals','WEIGHTED_NORMAL');n.keep_sharp=True
    return o
def cube(name,loc,size,mat,edge=.001):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);assign(o,name,mat)
    return bevel(o,min(edge,min(size)*.48))
def cyl(name,loc,r,depth,mat,vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
    o=assign(bpy.context.object,name,mat)
    for p in o.data.polygons:p.use_smooth=True
    return bevel(o,min(r*.08,depth*.12,.001),3)
def torus(name,loc,r,minor,mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=12,location=loc,major_radius=r,minor_radius=minor)
    o=assign(bpy.context.object,name,mat)
    for p in o.data.polygons:p.use_smooth=True
    return o
def sphere(name,loc,r,mat,scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=r,location=loc)
    o=assign(bpy.context.object,name,mat);o.scale=scale
    for p in o.data.polygons:p.use_smooth=True
    return o
def curve(name,points,r,mat):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=10;d.bevel_depth=r;d.bevel_resolution=3
    s=d.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for bp,p in zip(s.bezier_points,points):bp.co=p;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,d);COL.objects.link(o);d.materials.append(M[mat]);return o
def lathe(name,profile,mat):
    # Profile closes the outer/inner wall into an actual vessel, no overlapping spheres.
    n=72;verts=[];faces=[]
    for r,z in profile:
        verts +=[(r*math.cos(i*2*math.pi/n),r*math.sin(i*2*math.pi/n),z) for i in range(n)]
    for j in range(len(profile)-1):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);COL.objects.link(o);d.materials.append(M[mat])
    for p in d.polygons:p.use_smooth=True
    return o

new_asset('phone_landscape')
cube('PHONE_BODY',(0,0,.041),(.170,.0085,.082),'graphite',.005)
cube('PHONE_FRONT_GLASS',(0,-.0045,.041),(.164,.0014,.076),'dark',.004)
cube('PHONE_SCREEN_REPLACE',(0,-.00526,.041),(.150,.00012,.068),'screen',.003)
# GLB screen forward is +Z; origin [0,.041,.00526], local plane XY, 0.150 x0.068 m.
speaker=cube('PHONE_EARPIECE',(.079,-.005,.041),(.0011,.0004,.014),'dark',.0004)
for x in [-.022,.015]:cube('PHONE_SIDE_BUTTON',(x,.001,.083),(.018,.003,.0015),'gold',.0005)
sphere('PHONE_SELFIE_LENS',(-.079,-.0053,.042),.0022,'glass',(.85,.17,.85))

new_asset('portable_drive')
cube('SSD_CASING',(0,0,.012),(.106,.151,.024),'graphite',.007)
cube('SSD_TOP_INSET',(0,0,.024),(.097,.142,.001),'dark',.006)
for i in range(17):cube('SSD_COOLING_FLUTE_%02d'%i,(-.038+i*.0047,0,.0248),(.00075,.123,.00055),'pearl',.00025)
cube('SSD_USB_RECESS',(0,-.0758,.012),(.010,.001,.0035),'dark',.001)
cube('SSD_USB_CONTACT',(0,-.0764,.012),(.0065,.0003,.001),'gold',.0002)
cube('SSD_ACTIVITY_LED',(.037,-.059,.0255),(.005,.0015,.0005),'light',.0005)
for x in [-.039,.039]:
    for y in [-.060,.060]:cyl('SSD_RUBBER_FOOT', (x,y,.0013),.006,.0026,'dark',24)

new_asset('glass_vial')
lathe('VIAL_HOLLOW_OPTICAL_SHELL',[(0,0),(.023,0),(.026,.003),(.027,.008),(.027,.088),(.025,.096),(.016,.109),(.016,.126),(.0135,.126),(.0135,.109),(.023,.094),(.0245,.088),(.0245,.008),(0,.004)],'glass')
cyl('VIAL_LIQUID_VOLUME',(0,0,.035),.024,.060,'liquid')
sphere('VIAL_LIQUID_MENISCUS',(0,0,.065),.024,'liquid',(1,1,.10))
for z in [.115,.119,.123]:torus('VIAL_NECK_THREAD',(0,0,z),.0162,.0008,'clear')
cyl('VIAL_STOPPER',(0,0,.132),.018,.012,'graphite')
torus('VIAL_STOPPER_CHAMPAGNE_RING',(0,0,.1265),.018,.0007,'gold')
cyl('VIAL_STOPPER_TOP',(0,0,.1384),.014,.0012,'pearl')

new_asset('microfluidic_chip')
cube('CHIP_CERAMIC_SUBSTRATE',(0,0,.004),(.180,.105,.008),'pearl',.004)
cube('CHIP_DARK_OPTICAL_BED',(0,0,.0085),(.165,.092,.001),'graphite',.004)
cube('CHIP_TRANSPARENT_LID',(0,0,.014),(.162,.090,.003),'clear',.002)
pts=[(-.071,.024,.010),(-.053,.024,.010),(-.045,.014,.010),(-.045,-.021,.010),(-.029,-.028,.010),(-.013,-.021,.010),(-.013,.021,.010),(.004,.028,.010),(.021,.021,.010),(.021,-.020,.010),(.038,-.028,.010),(.055,-.020,.010),(.055,.016,.010),(.071,.024,.010)]
curve('CHIP_SERPENTINE_FLUID_CHANNEL',pts,.002,'teal')
curve('CHIP_LUMEN',pts,.0007,'light')
for x in [-.073,.073]:
    torus('CHIP_RECESSED_APERTURE',(x,.024,.016),.006,.0018,'gold')
    cyl('CHIP_PORT_LUMEN',(x,.024,.014),.0045,.002,'dark')
for x in [-.074,.074]:
    for y in [-.038,.038]:cyl('CHIP_MOUNTING_FASTENER',(x,y,.013),.002,.0015,'gold',24)

new_asset('sequencing_flowcell')
cube('FLOWCELL_CERAMIC_CARRIER',(0,0,.006),(.210,.126,.012),'white',.006)
cube('FLOWCELL_GRAPHITE_FRAME',(0,0,.012),(.198,.111,.003),'graphite',.004)
cube('FLOWCELL_OPTICAL_WINDOW',(0,0,.019),(.180,.096,.002),'clear',.003)
for lane,y in enumerate([-.031,-.0103,.0103,.031]):
    cube('FLOWCELL_LANE_%d_BED'%lane,(0,y,.015),(.148,.014,.001),'pearl',.006)
    curve('FLOWCELL_LANE_%d_LUMEN'%lane,[(-.082,y,.016),(-.065,y,.016),(.065,y,.016),(.082,y,.016)],.0014,'teal')
    for x in [-.084,.084]:
        torus('FLOWCELL_LANE_%d_APERTURE'%lane,(x,y,.020),.0043,.0011,'gold')
        cyl('FLOWCELL_LANE_%d_PORT'%lane,(x,y,.018),.0032,.002,'dark',32)
    for n in range(16):
        cyl('FLOWCELL_LANE_%d_REACTION_PAD_%02d'%(lane,n),(-.06+n*.008,y+.004,.016),.0008,.0008,'light' if n%3 else 'gold',12)
for x in [-.090,.090]:
    for y in [-.046,.046]:cyl('FLOWCELL_MOUNTING_BOLT',(x,y,.017),.0028,.002,'gold',24)

new_asset('synthesis_nozzle')
lathe('NOZZLE_SCULPTED_CASING',[(0,.04),(.010,.04),(.011,.064),(.016,.086),(.018,.135),(.017,.152),(.014,.161),(0,.161)],'pearl')
lathe('NOZZLE_HOLLOW_TIP',[(.0018,0),(.003,.013),(.007,.028),(.0095,.044),(.008,.044),(.0055,.028),(.0018,.013),(.0007,0),(.0018,0)],'glass')
torus('NOZZLE_NECK_COLLAR',(0,0,.045),.011,.0015,'gold')
cyl('NOZZLE_GRIP',(0,0,.12),.0188,.018,'graphite')
for z in [.114,.117,.120,.123,.126]:torus('NOZZLE_GRIP_DETAIL',(0,0,z),.019,.0004,'gold')
cyl('NOZZLE_PLUNGER_STEM',(0,0,.167),.004,.012,'gold')
cyl('NOZZLE_PLUNGER_CAP',(0,0,.175),.010,.006,'graphite')

new_asset('lab_table')
cube('LAB_FLOATING_WORKTOP',(0,0,.77),(2.0,.95,.08),'white',.034)
cube('LAB_METAL_UNDERCUT',(0,0,.729),(1.94,.89,.014),'gold',.018)
for x in [-.82,.82]:cube('LAB_INSET_PEDESTAL',(x,.10,.36),(.16,.58,.72),'pearl',.024)

def bounds(objects):
    pts=[]
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get()
    for o in objects:
        if o.type in ('MESH','CURVE'):
            ev=o.evaluated_get(dg);mesh=ev.to_mesh()
            pts.extend(ev.matrix_world@v.co for v in mesh.vertices)
            ev.to_mesh_clear()
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
    # Blender x,y,z → GLB x,z,-y
    return {'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]],'size':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]]}
manifest={'schema':'rainbow.dna.assets/v3','source':'Locally authored Blender 5.1.2 Python geometry','license':'Original project procedural geometry; no external asset restrictions','units':'meter','coordinates':'GLB Y up, right handed. Blender +Z maps GLB +Y; Blender -Y maps GLB +Z. All bases at Y=0.','assets':{}}
for name,col in ASSETS.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects:o.select_set(True)
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
    manifest['assets'][name]={'path':path.name,'bounds':bounds(col.objects),'objects':len(col.objects),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
manifest['assets']['phone_landscape']['screen']={'name':'PHONE_SCREEN_REPLACE','center':[0,.041,.00526],'width':.150,'height':.068,'normal':[0,0,1],'plane':'XY','suggestedTextureAspect':2.2059}
manifest['recommendedDisplayScale']={'phone_landscape':22,'portable_drive':18,'glass_vial':28,'microfluidic_chip':22,'sequencing_flowcell':21,'synthesis_nozzle':24,'lab_table':3}
(OUT/'assets-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')

# Local preview stage. Originals are already exported separately at their true meter scale.
COL=bpy.data.collections.new('PREVIEW_STAGE');scene.collection.children.link(COL)
cube('PREVIEW_CYCLORAMA',(0,0,-.008),(4,4,.014),'backdrop',.006)
def move(col,position,scale=1,rotation=0):
    for o in ASSETS[col].objects:
        o.location=Vector(position)+o.location*scale;o.scale*=scale
        if rotation:o.rotation_euler.z+=rotation
move('phone_landscape',(-.28,.06,0),2.0)
move('portable_drive',(-.28,-.22,0),1.5)
move('glass_vial',(.13,.06,0),2.4)
move('microfluidic_chip',(.06,-.27,0),1.8)
move('sequencing_flowcell',(.39,-.13,0),1.8)
move('synthesis_nozzle',(.44,.18,.035),1.7)
for o in ASSETS['lab_table'].objects:o.hide_render=True

world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.73,.80,.79,1);world.node_tree.nodes['Background'].inputs[1].default_value=.32
def area(name,loc,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,.10))-o.location).to_track_quat('-Z','Y').to_euler()
area('PREVIEW_SOFTBOX_KEY',(-.6,-.7,1.5),85,1.4,(.93,.98,1))
area('PREVIEW_SOFTBOX_WARM',(.8,.4,1.1),62,1.0,(1,.88,.70))
area('PREVIEW_STRIP_REFLECTION',(-.6,.5,.7),38,.8,(.51,.86,.86))
bpy.ops.object.camera_add(location=(.95,-1.28,.92));cam=bpy.context.object;cam.name='CAMERA_ASSET_PREVIEW';scene.camera=cam;cam.data.lens=48;cam.data.clip_start=.005
cam.rotation_euler=(Vector((.02,-.05,.12))-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'dna_lab_assets_v3.blend'))
scene.render.filepath=str(OUT/'asset-preview.png');bpy.ops.render.render(write_still=True)

# A separate no-text bridge source: macro optical lanes + a liquid vial in a pearl studio.
for name,col in ASSETS.items():
    if name not in ('glass_vial','microfluidic_chip','sequencing_flowcell','synthesis_nozzle'):
        for o in col.objects:o.hide_render=True
cam.location=(.49,-.65,.24);target=Vector((.12,-.15,.09));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=42
cam.data.dof.use_dof=True;cam.data.dof.focus_distance=(target-cam.location).length;cam.data.dof.aperture_fstop=3.8
scene.render.filepath=str(OUT/'wan-bridge-source.png');bpy.ops.render.render(write_still=True)
print('V3_ASSETS_COMPLETE '+str(OUT))
