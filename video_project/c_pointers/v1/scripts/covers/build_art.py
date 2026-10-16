"""Original dimensional pointer teaching cover assets; Blender 5.x background."""
import sys, math, json, hashlib
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/covers/artwork'; OUT.mkdir(parents=True,exist_ok=True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
name=args[args.index('--layout')+1] if '--layout' in args else '16x9'
draft='--draft' in args
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene; sc.unit_settings.system='METRIC'

def mat(name,c,rough=.3,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*c,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal;return m
ceramic=mat('Ivory porcelain',(.88,.91,.91),.24)
blue=mat('Deep cobalt ceramic',(.025,.10,.39),.24)
ink=mat('Printed midnight blue',(.018,.035,.072),.43)
white=mat('Warm white ink',(.94,.96,.94),.4)
edge=mat('Anodised soft silver',(.41,.49,.55),.28,.6)
inactive=mat('Out of focus ceramic',(.76,.80,.82),.6)
pathmat=mat('Cobalt address path',(.025,.18,.59),.23,.3)
gold=mat('Warm contact ring',(.57,.35,.13),.26,.72)

def cube(name,loc,size,m,b=.10):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if b:
  mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=b;mod.segments=8;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o

font=bpy.data.fonts.load('C:/Windows/Fonts/consolab.ttf')
def text(label,loc,size,m):
 d=bpy.data.curves.new('Exact printed '+label,'FONT');d.body=label;d.font=font;d.size=size;d.align_x='CENTER';d.align_y='CENTER';d.extrude=.001;d.resolution_u=16;o=bpy.data.objects.new('Print '+label,d);sc.collection.objects.link(o);o.location=loc;o.data.materials.append(m);return o

def cable(coords):
 d=bpy.data.curves.new('Single address route','CURVE');d.dimensions='3D';d.resolution_u=48;d.bevel_depth=.055;d.bevel_resolution=6;s=d.splines.new('BEZIER');s.bezier_points.add(len(coords)-1)
 for p,c in zip(s.bezier_points,coords):p.co=c;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 o=bpy.data.objects.new('p points to score',d);sc.collection.objects.link(o);o.data.materials.append(pathmat)

portrait=name in {'3x4','9x16'}
score=(1.2,1.45 if portrait else .75)
pointer=(-1.35,-1.7 if portrait else -1.35)
sx,sy=score;px,py=pointer
cube('score plinth',(sx,sy,.18),(2.82,2.58,.32),edge,.12)
cube('score data object',(sx,sy,.72),(2.75,2.52,.85),ceramic,.18)
cube('score printed recess',(sx,sy,1.16),(2.28,2.06,.04),white,.12)
text('score',(sx,sy+.64,1.19),.39,ink)
text('7',(sx,sy-.20,1.19),1.38,ink)
# An external address plaque labels the location, not the stored integer.
cube('Object address rail',(sx,sy-1.38,.31),(2.35,.34,.18),ceramic,.06)
text('0x1000',(sx,sy-1.38,.41),.28,ink)
cube('p pointer variable base',(px,py,.16),(2.00,1.94,.26),edge,.12)
cube('p pointer variable',(px,py,.61),(1.94,1.88,.73),blue,.18)
text('p',(px,py+.31,.99),.85,white)
text('0x1000',(px,py-.45,.99),.34,white)
# One continuous route, outside both bodies, terminates at score's address rail.
cable([(px+.98,py,.5),(px+1.30,py+.04,.5),(sx+1.77,py+.48,.23),(sx+1.78,sy-1.2,.23),(sx+1.35,sy-1.38,.30),(sx+1.10,sy-1.38,.31)])
for i in range(3):
 cube('Background memory '+str(i),(-2.0+i*2.05,4.25,.22),(1.75,1.55,.42),inactive,.12)
 # restrained inactive compartments, subordinate and unfocused
 cube('Background inset '+str(i),(-2.0+i*2.05,4.25,.44),(1.40,1.20,.035),ceramic,.10)

floor=cube('Shadow catcher',(0,0,-.08),(200,200,.1),mat('Ground',(.9,.91,.90),.85),0);floor.is_shadow_catcher=True
def light(name,loc,energy,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()
light('Large key',(-5,-6,10),1200,7,(1,.94,.85));light('Cool broad fill',(7,1,6),850,6,(.76,.88,1));light('Soft top rim',(-3,7,9),950,5,(1,1,.96))
world=bpy.data.worlds.new('Neutral studio');world.use_nodes=True;next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs['Color'].default_value=(.65,.73,.79,1);next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs['Strength'].default_value=.22;sc.world=world
campos={'16x9':(7,-11,12),'4x3':(6,-12,12),'3x4':(6,-11,13),'9x16':(5,-12,14)}[name]
look=Vector((.20,.70,.35));bpy.ops.object.camera_add(location=campos);cam=bpy.context.object;cam.name='Pointer cover '+name;cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=8.5 if not portrait else 8.8
cam.data.dof.use_dof=True;cam.data.dof.focus_distance=(Vector((.1,-.1,.7))-cam.location).length;cam.data.dof.aperture_fstop=9;sc.camera=cam
sc.render.engine='CYCLES';sc.cycles.samples=24 if draft else 96;sc.cycles.use_denoising=True
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
 for device in prefs.devices:device.use=device.type=='OPTIX'
 sc.cycles.device='GPU'
except Exception:sc.cycles.device='CPU'
sc.render.resolution_x=sc.render.resolution_y=900 if draft else 1700;sc.render.resolution_percentage=100
sc.render.film_transparent=True;sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.image_settings.color_depth='8'
sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=.32
dest=OUT/(name+('-draft' if draft else '')+'.png');sc.render.filepath=str(dest)
if not draft:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
bpy.ops.render.render(write_still=True)
manifest={'layout':name,'engine':'Blender 5.1.2 Cycles','samples':sc.cycles.samples,'image':str(dest.relative_to(ROOT)),'imageSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'source':'Original procedural illustration; no generated/rented model','meaning':'p stores illustrative address 0x1000; single route reaches score object at same illustrative address; stored score remains 7','memoryScale':'Objects are metaphorical, not a hardware photograph'}
(OUT/(name+('-draft' if draft else '')+'-source.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('COVER_READY',dest)
