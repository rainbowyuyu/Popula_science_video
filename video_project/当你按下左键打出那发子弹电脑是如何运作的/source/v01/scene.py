"""Blender 5.1, deterministic educational diorama. Project-local outputs only.
Run: blender --background --python source/v01/scene.py -- --stills
Or: --frames 1 72 ; --all ; already rendered PNGs are reused.
No external model/scripts, no private assets, no real-match claims.
"""
import bpy, math, json, sys, shutil, datetime
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import revision
ROOT=revision.ROOT
W=1280; H=720; FPS=revision.FPS; END=revision.FRAME_COUNT
DATA=json.loads((ROOT/'work/v01/mechanism.json').read_text(encoding='utf-8'))
OUT=revision.FRAMES; OUT.mkdir(parents=True,exist_ok=True)
# Clear only in-memory factory objects, never disk files.
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=12
scene.cycles.use_denoising=True
# Prefer EEVEE for the interactive-length prototype; CPU-compatible background mode.
scene.render.engine='CYCLES' if '--cycles' in sys.argv else 'BLENDER_EEVEE'
scene.render.resolution_x=W; scene.render.resolution_y=H; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.fps=FPS; scene.frame_start=1; scene.frame_end=END
scene.render.film_transparent=False
scene.world.color=(.035,.035,.035)
scene.view_settings.view_transform='AgX'

def mat(name,color,metal=0,rough=.4,emit=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emit
    return m
navy=mat('midnight graphite',(.022,.047,.070),.55,.3)
slate=mat('blue ceramic',(.075,.16,.21),.55,.32)
ground=mat('stage',(.012,.024,.041),.35,.4)
cyan=mat('local cyan',(.03,.75,.95),.25,.27,2)
gold=mat('command amber',(1,.46,.075),.3,.27,2)
green=mat('confirmed mint',(.14,1,.58),.2,.25,1.8)
muted=mat('inactive circuit',(.055,.16,.20),.4,.4,.2)
sand=mat('schematic door',(.38,.22,.1),.3,.45)
white=mat('lettering',(.73,.9,.95),0,.5,.7)
red=mat('current history',(.4,.23,.14),.4,.5,.3)
objects={}

def box(name,loc,scale,material,bevel=.08):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object; ob.name=name; ob.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if material: ob.data.materials.append(material)
    if bevel:
        mod=ob.modifiers.new('rounded edges','BEVEL'); mod.width=bevel; mod.segments=3
        ob.modifiers.new('weighted normals','WEIGHTED_NORMAL')
    objects[name]=ob; return ob

def ball(name,loc,r,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=r,location=loc)
    ob=bpy.context.object; ob.name=name; ob.data.materials.append(material)
    for p in ob.data.polygons:p.use_smooth=True
    objects[name]=ob;return ob

def line(name,pts,material,r=.025):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.bevel_depth=r; cu.bevel_resolution=3
    sp=cu.splines.new('POLY'); sp.points.add(len(pts)-1)
    for p,co in zip(sp.points,pts):p.co=(*co,1)
    ob=bpy.data.objects.new(name,cu);scene.collection.objects.link(ob);ob.data.materials.append(material);objects[name]=ob;return ob

def text(name,body,loc,size=.3,material=white,rotation=(math.pi/2,0,0)):
    cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.size=size;cu.align_x='CENTER';cu.align_y='CENTER'
    ob=bpy.data.objects.new(name,cu);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=rotation;ob.data.materials.append(material);objects[name]=ob;return ob

def wire(name,lo,hi,material,r=.018):
    pts=[(x,y,z) for x in [lo[0],hi[0]] for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]]
    arr=[]
    for i,p in enumerate(pts):
        for j,q in enumerate(pts):
            if j>i and sum(p[k]!=q[k] for k in range(3))==1:arr.append(line(name+str(i)+'_'+str(j),[p,q],material,r))
    return arr

def visible_key(ob,frame,show):
    ob.hide_render=not show;ob.hide_viewport=not show
    ob.keyframe_insert('hide_render',frame=frame);ob.keyframe_insert('hide_viewport',frame=frame)

def show_interval(ob,start,end=END):
    if start>1:visible_key(ob,1,False);visible_key(ob,start-1,False)
    visible_key(ob,start,True);visible_key(ob,end,True)
    if end<END:visible_key(ob,end+1,False)

# One continuous spatial layout. Client left, authoritative server right.
box('floor',(0,0,-.35),(200,200,.3),ground,.0)
box('client platform',(-5,0,-.02),(6.5,6.5,.32),navy,.22)
box('server platform',(4.6,0,-.02),(7,6.5,.32),navy,.22)
for x in [-8,-7,-6,-5,-4,-3,-2,1.5,2.5,3.5,4.5,5.5,6.5,7.5]:
    line('floor trace '+str(x),[(x,-3,.16),(x,3,.16)],muted,.009)
# Physical mouse with separate button; not assumed to be player's hardware.
mouse=ball('mouse shell',(-7,-1.7,.48),1,navy);mouse.scale=(.62,.95,.38)
left=box('left switch',(-7.29,-1.92,.79),(.49,.77,.07),cyan,.10)
box('right switch',(-6.72,-1.92,.79),(.49,.77,.07),slate,.10)
box('scroll wheel',(-7,-2.08,.84),(.12,.32,.12),white,.05)
line('USB cable',[(-7,-2.6,.48),(-7,-3.35,.35),(-5.4,-3.35,.35),(-5.4,-1,.35)],muted,.035)
# CPU and memory are part of a state board, not a mandatory physical bus itinerary.
box('state board',(-5.1,-.8,.26),(2.35,2.25,.16),slate)
box('CPU',(-5.4,-.9,.48),(1.1,1.1,.24),navy)
text('CPU label','CPU',(-5.4,-.91,.62),.3,white,(0,0,0))
for x in [-4.55,-4.25]:box('RAM'+str(x),(x,-.8,.49),(.18,1.6,.35),slate,.03)
for k in range(8):
    x=-5.85+k*.13
    box('pin'+str(k),(x,-1.56,.38),(.06,.19,.05),gold,.0)
# Actual monitor geometry. Screen faces toward -Y.
box('monitor stand',(-5,1.5,.36),(1.2,.7,.16),slate)
box('monitor stem',(-5,1.6,1.1),(.22,.25,1.4),slate)
box('monitor shell',(-5,1.65,2.1),(3.5,.2,2.1),navy,.12)
box('screen',(-5,1.52,2.1),(3.24,.035,1.86),muted,.02)
# Repeated door motif in local screen; schematic, no game logo/identities.
for xx in [-5.55,-4.45]:box('screen door'+str(xx),(xx,1.485,2.0),(.78,.03,1.2),sand,.01)
line('reticle x',[(-5.17,1.46,2.2),(-4.83,1.46,2.2)],white,.012)
line('reticle z',[(-5,1.46,2.03),(-5,1.46,2.37)],white,.012)
flash=ball('local flash',(-5,1.38,1.55),.25,gold);show_interval(flash,133,152)
notice=box('local confirmed strip',(-4.4,1.45,2.78),(1.8,.04,.22),green,.02);show_interval(notice,493)
# Server rack right, enough separation from ray-test diorama.
box('server rack',(7,1.4,1.6),(1.3,1.25,3),slate)
for k in range(7):
    z=.45+k*.38;box('server slot'+str(k),(7,.74,z),(1.12,.06,.23),navy,.02)
    ball('server led'+str(k),(7.4,.69,z),.035,green)
text('rack label','SERVER',(7,.68,3.23),.25)
# A non-game reproduction of a doorway, reusing tested coordinates exactly.
def door_assembly(wall):
    lo,hi=wall['min'],wall['max'];loc=[(lo[i]+hi[i])/2 for i in range(3)];size=[hi[i]-lo[i] for i in range(3)]
    solid=box(wall['id'],loc,size,sand,.035)
    for z in [.4,1.25,2.15]:
        band=box(wall['id']+' band'+str(z),(loc[0],-.225,z),(size[0],.04,.11),navy,.01)
        band.parent=solid;band.matrix_parent_inverse=solid.matrix_world.inverted()
    show_interval(solid,1,END)
    pad=.028
    for edge in wire(wall['id']+' collision outline',[v-pad for v in lo],[v+pad for v in hi],sand,.02):
        show_interval(edge,289,447)
    # Motivated gesture instead of an instant swap: the solid slab settles onto the
    # floor while the full-height collision outline stays, so the later ray test is readable.
    for f,s in [(289,1.0),(317,.03),(419,.03),(447,1.0)]:
        solid.scale.z=s;solid.location.z=loc[2]*s
        solid.keyframe_insert('scale',frame=f);solid.keyframe_insert('location',frame=f)

for wall in DATA['walls']:
    door_assembly(wall)
# De-emphasize current position, highlight history. Both computed from DATA.
cur=DATA['current'];hist=DATA['historical']
current_wire=wire('current position',cur['min'],cur['max'],red,.015)
history_wire=wire('history position',hist['min'],hist['max'],cyan,.023)
for ob in current_wire:show_interval(ob,241)
for ob in history_wire:show_interval(ob,313)
# Simplified target body fits exactly inside each tested collision box.
body=box('current abstract torso',(3.7,1.725,.83),(.36,.3,.8),slate,.10);show_interval(body,241)
head=ball('current abstract head',(3.7,1.725,1.51),.21,slate);show_interval(head,241)
hbody=box('historic abstract torso',(2.5,1.725,.83),(.36,.3,.8),muted,.1);show_interval(hbody,313)
hhead=ball('historic abstract head',(2.5,1.725,1.51),.21,muted);show_interval(hhead,313)
# Entire ray appears at once: no travelling projectile.
ray=line('instant hit ray',[DATA['origin'],DATA['hit']['point']],gold,.026);show_interval(ray,361,432)
hit=ball('tested intersection',DATA['hit']['point'],.095,green);show_interval(hit,361,432)
wire('origin marker',[2.42,-2.88,1.02],[2.58,-2.72,1.18],gold,.014)
# Two paths from a shared input. Tracks are logical not literal USB wiring.
local_path=[(-7,-1.65,.92),(-5.4,-.9,.9),(-5,1.4,1.55)]
uplink=[(-5.4,-.9,.9),(-3,-1.4,.65),(-.2,-1.4,.65),(1.2,-1.4,.65),(7,.7,1.8)]
downlink=[(7,.7,1.8),(5,-2.6,.55),(0,-2.6,.55),(-3,-2.6,.55),(-5,1.4,2.78)]
for name,pts,start,end in [('local input',local_path,1,240),('uplink',uplink,111,240),('return',downlink,433,END)]:
    track=line(name+' track',pts,muted,.022);show_interval(track,start,end)

def travelling(name,pts,start,end,material):
    ob=ball(name,pts[0],.13,material);show_interval(ob,start,end)
    lengths=[(Vector(b)-Vector(a)).length for a,b in zip(pts,pts[1:])];total=sum(lengths);acc=0
    ob.location=pts[0];ob.keyframe_insert('location',frame=start)
    for pt,L in zip(pts[1:],lengths):
        acc+=L;ob.location=pt;ob.keyframe_insert('location',frame=round(start+(end-start)*acc/total))
    return ob
travelling('input pulse',local_path[:2],49,110,cyan)
travelling('local prediction',local_path[1:],111,133,cyan)
travelling('network command',uplink,111,240,gold)
travelling('authoritative result',downlink,433,493,green)
left.location.z=.79;left.keyframe_insert('location',frame=1);left.keyframe_insert('location',frame=44)
left.location.z=.71;left.keyframe_insert('location',frame=49);left.keyframe_insert('location',frame=60)
left.location.z=.79;left.keyframe_insert('location',frame=67)
# Fixed camera targets; smoothly moving viewpoint, never tied to real time.
bpy.ops.object.camera_add(location=(0,-20,15));camera=bpy.context.object;camera.name='Main camera';scene.camera=camera
camera.data.type='ORTHO';camera.data.lens=42
keys=[(1,(-9,-13,11),(-5.5,-.3,1.2),13), (110,(-8,-14,11),(-5,-.1,1.2),13.5), (180,(-1,-19,15),(0,0,.6),21.5), (240,(1,-18,15),(1,0,.7),21.5), (300,(7,-11,10),(3.6,.1,1),11.5), (410,(8,-10,9),(3.6,.1,1),11.5), (470,(0,-19,15),(0,0,.7),21.5), (530,(-7,-13,10),(-5,.7,1.5),10.5), (576,(-7,-13,10),(-5,.7,1.5),10.5)]
for f,loc,target,scale in keys:
    camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
    camera.keyframe_insert('location',frame=f);camera.keyframe_insert('rotation_euler',frame=f);camera.data.keyframe_insert('ortho_scale',frame=f)
# Linear packet motion, eased camera only; all keyframes stored in .blend.
for ob in list(objects.values())+[camera,camera.data]:
    if not ob.animation_data or not ob.animation_data.action:continue
    action=ob.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for key in fc.keyframe_points:
                        if 'hide_' in fc.data_path:key.interpolation='CONSTANT'
                        elif ob.name.startswith('door'):key.interpolation='BEZIER';key.handle_left_type='AUTO_CLAMPED';key.handle_right_type='AUTO_CLAMPED'
                        elif ob in [camera,camera.data]:key.interpolation='BEZIER';key.handle_left_type='AUTO_CLAMPED';key.handle_right_type='AUTO_CLAMPED'
                        else:key.interpolation='LINEAR'
# Studio light.
def area(name,loc,energy,color,size,target):
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=energy;o.data.color=color;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('key',(-3,-6,12),2400,(.65,.85,1),10,(0,0,0))
area('warm rim',(5,5,9),2800,(1,.59,.28),8,(3,0,0))
area('cyan fill',(-9,3,6),1600,(.15,.65,1),6,(-5,0,0))
scene.frame_set(1)
blend=revision.BLEND;blend.parent.mkdir(parents=True,exist_ok=True)
if not blend.exists():bpy.ops.wm.save_as_mainfile(filepath=str(blend))
# Export camera projected anchor positions for truthful object-attached labels.
from bpy_extras.object_utils import world_to_camera_view
anchor_positions={'client':(-5,1.6,3.25),'server':(7,1.4,3.7),'history':(2.5,1.7,2.1),'current':(3.7,1.7,2.1),'input':(-7,-1.7,.8)}
manifest=[]
for f in range(1,END+1):
    scene.frame_set(f);row={'frame':f,'anchors':{}}
    for n,p in anchor_positions.items():
        uv=world_to_camera_view(scene,camera,Vector(p));row['anchors'][n]=[round(uv.x*W,2),round((1-uv.y)*H,2)]
    manifest.append(row)
mfile=revision.ANCHORS
if not mfile.exists():mfile.write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if '--stills' in args:frames=[1,133,218,337,385,520]
elif '--frames' in args:
    idx=args.index('--frames');frames=range(int(args[idx+1]),int(args[idx+2])+1)
elif '--all' in args:frames=range(1,END+1)
else:frames=[]
for f in frames:
    dest=OUT/f'{f:04d}.png'
    if dest.exists():continue
    scene.frame_set(f);scene.render.filepath=str(dest);bpy.ops.render.render(write_still=True)
print('SCENE_OK',len(objects),'objects; saved:',blend,'frames_requested:',len(frames))
