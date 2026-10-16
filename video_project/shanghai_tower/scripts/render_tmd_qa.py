import bpy, math
from pathlib import Path
from mathutils import Vector
r=Path(__file__).resolve().parents[1];out=r/'research/tmd-v3';bpy.ops.wm.open_mainfile(filepath=str(r/'model/shanghai-tower.blend'))
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=24;s.cycles.use_denoising=True
s.render.resolution_x=1000;s.render.resolution_y=1000;s.render.resolution_percentage=100
s.world.use_nodes=True;bg=s.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.78,.83,.87,1);bg.inputs[1].default_value=.45
s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG'
d=bpy.data.cameras.new('QA_Camera');cam=bpy.data.objects.new('QA_Camera',d);s.collection.objects.link(cam);s.camera=cam;d.type='ORTHO';d.clip_start=.1;d.clip_end=2000
lights=[]
for name,loc,power,size in [('Key',(15,-20,615),18000,18),('Fill',(-15,-5,603),11000,20),('Rim',(8,16,607),26000,12)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);s.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,590))-ob.location).to_track_quat('-Z','Y').to_euler();lights.append(ob)
def shot(name,visible,location,target,scale):
 for ob in bpy.data.objects:
  if ob.type=='MESH':ob.hide_render=not visible(ob.name)
 cam.location=location;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;s.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
shot('tmd-assembly.png',lambda n:n.startswith('TMD'),(34,-43,608),(0,0,594),39)
shot('tmd-mass-detail.png',lambda n:n.startswith('TMD'),(6,-29,589),(0,0,584.5),23)
shot('tmd-underview.png',lambda n:n.startswith('TMD'),(3,-27,580.1),(0,0,582.5),21)
# Explicit maximum physical relative-displacement check; no made-up sinusoid.
import json
e=json.loads((r/'public/physics/environment-response.json').read_text(encoding='utf8'));peak=max(abs(x) for x in e['tmd']['relativeX_m']);rise=25-math.sqrt(25**2-peak**2)
cables=bpy.data.objects['TMD_CABLES'];rest=[v.co.copy() for v in cables.data.vertices]
for sign in (-1,1):
 for ob in bpy.data.objects:
  if ob.name.startswith('TMD_MASS') or ob.name=='TMD_MAGNET_ARRAY':ob.location.x=sign*peak;ob.location.z=rise
 for v,q in zip(cables.data.vertices,rest):
  w=(609.6-q.z)/25;v.co=q+Vector((sign*peak*w,0,rise*w))
 shot('tmd-sway-'+('left' if sign<0 else 'right')+'.png',lambda n:n.startswith('TMD'),(6,-29,589),(0,0,584.5),23)
for ob in bpy.data.objects:
 if ob.name.startswith('TMD_MASS') or ob.name=='TMD_MAGNET_ARRAY':ob.location=Vector((0,0,0))
for v,q in zip(cables.data.vertices,rest):v.co=q
for ob in lights:ob.location=Vector((ob.location.x*9,ob.location.y*9,(ob.location.z-590)*8+90));ob.data.energy*=80;ob.data.size*=8;ob.rotation_euler=(Vector((0,0,-25))-ob.location).to_track_quat('-Z','Y').to_euler()
shot('soil-cutaway.png',lambda n:n.startswith(('SOIL','PILES','RAFT','BASEMENT','DIAPHRAGM','GROUND','CORE_Z01','MEGACOL_Z01')),(155,-230,95),(0,0,-28),245)
print('TMD_QA_STILLS_DONE')
