"""Four independently framed architectural covers, CPU Cycles only."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'cover';OUT.mkdir(exist_ok=True)
manifest=json.loads((ROOT/'public/models/shanghai-tower-manifest.json').read_text(encoding='utf8'))
byid={p['id']:p for p in manifest['parts']}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'model/shanghai-tower.blend'))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_percentage=100;scene.render.image_settings.color_depth='8'
scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.80,.86,.91,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.38
scene.view_settings.view_transform='AgX'

def color(name,col,rough,metal):
 aliases={
  'Outer glass | blue green':'Outer glass | soft mineral blue',
  'Inner glass | warm clear':'Inner glass | soft clear blue',
  'Concrete | warm ivory':'Concrete | warm mineral',
 }
 material=bpy.data.materials.get(name) or bpy.data.materials.get(aliases.get(name,name))
 if material is None:
  material=bpy.data.materials.new(name); material.use_nodes=True
 m=material;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Alpha'].default_value=1
color('Outer glass | blue green',(.085,.19,.245),.25,.62)
color('Inner glass | warm clear',(.21,.37,.40),.36,.32)
color('Mullions | platinum',(.53,.69,.71),.30,.75)
color('Concrete | warm ivory',(.62,.61,.55),.7,.05)
color('Floor plate | architectural silver',(.54,.59,.58),.45,.25)
# The upgraded structural model uses the explicit ``Steel framing`` material
# (the previous cover pass called this ``Megaframe``).  Keep the cover tied to
# the current model vocabulary so a model rebuild cannot silently render with
# an old material name.
color('Steel framing | graphite silver',(.45,.33,.19),.34,.52)
color('Outrigger | satin champagne',(.65,.40,.15),.31,.55)

def area(name,loc,energy,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,300))-o.location).to_track_quat('-Z','Y').to_euler()
area('Softbox key',(400,-600,900),38000000,650)
area('Softbox fill',(-500,-200,350),16000000,700)
area('Rim reflection',(80,400,700),50000000,420)
d=bpy.data.cameras.new('CoverCamera');camera=bpy.data.objects.new('CoverCamera',d);scene.collection.objects.link(camera);scene.camera=camera;d.type='ORTHO';d.clip_end=10000

# A coherent assembly: reveal selected shell panels, keep the central
# structural tower; no arrows, pop-out labels or unrelated mini windows.
rest={o.name:o.matrix_world.copy() for o in bpy.data.objects if o.type=='MESH'}
for o in bpy.data.objects:
 if o.type!='MESH':continue
 p=byid.get(o.name,{});role=p.get('role','');loc=Vector((0,0,0))
 if role in ['outerglass','mullions']:
  sec=int(o.name.split('_S')[1][:2]);zone=10 if 'CROWN' in o.name else int(o.name.split('_Z')[1][:2])
  # Open the visible southern half in individual, fan-shaped leaves.
  if sec in (4,5,6):
   v=p['explodeVectorThree'];loc=Vector((v[0],-v[2],0)).normalized()*(80+zone*2)
   loc.z=(zone-4.5)*5
   o.rotation_euler.z=math.radians((-1 if sec<6 else 1)*7)
  else:
   mat=o.data.materials[0].copy();o.data.materials[0]=mat;pr=mat.node_tree.nodes.get('Principled BSDF');pr.inputs['Alpha'].default_value=.78;mat.surface_render_method='DITHERED'
 elif role=='spiralrib':o.hide_render=True
 elif role=='soil':o.hide_render=True
 elif role in ['innerfacade','innerframe']:
  if '_2_' in o.name:o.hide_render=True
  elif role=='innerfacade':o.hide_render=True
 elif role=='core':
  if '_W4' in o.name:o.hide_render=True
 elif role=='floors' and '_FRONT' in o.name:
  zone=int(o.name.split('_Z')[1][:2]);loc=Vector((0,-14-zone,0))
 elif role=='plaza':o.hide_render=True
 o.location+=loc

LAYOUTS={
 '16x9':{'size':[1920,1080],'camera':[900,-1400,560],'target':[0,0,280],'scale':1360,'shift_x':-.23,'shift_y':0.005},
 '4x3':{'size':[1920,1440],'camera':[850,-1350,550],'target':[0,0,275],'scale':1200,'shift_x':-.23,'shift_y':0.005},
 '3x4':{'size':[1440,1920],'camera':[810,-1380,570],'target':[0,0,276],'scale':1200,'shift_x':-.015,'shift_y':.175},
 '9x16':{'size':[1080,1920],'camera':[760,-1450,570],'target':[0,0,282],'scale':1180,'shift_x':0.0,'shift_y':.17}
}
selected=None
for a in sys.argv:
 if a.startswith('--ratio='):selected=a.split('=',1)[1]
for name,p in LAYOUTS.items():
 if selected and name!=selected:continue
 scene.render.resolution_x,scene.render.resolution_y=p['size'];camera.location=p['camera'];camera.rotation_euler=(Vector(p['target'])-camera.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=p['scale'];d.shift_x=p['shift_x'];d.shift_y=p['shift_y']
 scene.render.filepath=str(OUT/f'tower-{name}.png');bpy.ops.render.render(write_still=True)
if not selected or selected=='detail':
 for o in bpy.data.objects:
  if o.type!='MESH':continue
  p=byid.get(o.name,{});o.hide_render=not ('Z05' in o.name and p.get('role') in ['core','megacolumn','outrigger','floors','floorbeams','garden','sky_lobby'])
  if '_W4' in o.name:o.hide_render=True
  if '_FRONT' in o.name:o.hide_render=True
  o.location=(0,0,0);o.rotation_euler=(0,0,0)
 camera.location=(200,-310,400);camera.rotation_euler=(Vector((0,0,268))-camera.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=110;d.shift_x=0;d.shift_y=0;scene.render.resolution_x=1100;scene.render.resolution_y=950
 scene.render.filepath=str(OUT/'tower-detail.png');bpy.ops.render.render(write_still=True)
(OUT/'render-layouts.json').write_text(json.dumps({
 'renderer':'Blender Cycles CPU, 32 samples, AgX',
 'source_model':'model/shanghai-tower.blend',
 'source_manifest':'public/models/shanghai-tower-manifest.json',
 'manifest_schema':manifest.get('schema'),
 'manifest_part_count':len(manifest.get('parts', [])),
 'structural_graph_summary':manifest.get('structuralGraphSummary'),
 'layouts':LAYOUTS,
 'scene':'Exploded front curtain-wall leaves with assembled internal frame; foreground half decks slid outward; source-native scale preserved.'
},indent=2,ensure_ascii=False),encoding='utf8')
