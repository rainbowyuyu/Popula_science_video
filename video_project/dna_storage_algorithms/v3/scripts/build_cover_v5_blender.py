"""Independent cover staging from the V5 film's image and molecular design.
Run with the user's Blender installation. No movie source is modified.
"""
import bpy, math, json, sys, random
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'cover-v5'; ART=OUT/'artwork'; ART.mkdir(parents=True,exist_ok=True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
preview='--preview' in args
selected=next((x.split('=')[1] for x in args if x.startswith('--ratio=')),None)
layouts={
 '16x9':{'size':[1920,1080],'target':[850,155,1880,1020],'portrait':False},
 '4x3':{'size':[1920,1440],'target':[780,260,1870,1390],'portrait':False},
 '3x4':{'size':[1440,1920],'target':[50,760,1410,1860],'portrait':True},
 '9x16':{'size':[1080,1920],'target':[10,700,1070,1850],'portrait':True},
}
def rgb(h):
 h=h.lstrip('#'); vals=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals)
def material(name,color,metal=.0,rough=.3):
 m=bpy.data.materials.new(name);m.diffuse_color=(*rgb(color),1);m.use_nodes=True
 m.node_tree.nodes.clear();b=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(b.outputs['BSDF'],out.inputs['Surface']);b.inputs['Base Color'].default_value=(*rgb(color),1)
 b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 b.inputs['Coat Weight'].default_value=.32;b.inputs['Coat Roughness'].default_value=.23
 return m
def parent(obj,group):obj.parent=group;return obj
def box(name,location,size,mat,group,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Fine rounded edges','BEVEL');m.width=bevel;m.segments=4
  o.modifiers.new('Weighted reflections','WEIGHTED_NORMAL')
 return parent(o,group)
def sphere(name,p,r,mat,group):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=r,location=p);o=bpy.context.object;o.name=name;o.data.materials.append(mat)
 for f in o.data.polygons:f.use_smooth=True
 return parent(o,group)
def tube(name,points,r,mat,group):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=3;c.bevel_depth=r;c.bevel_resolution=4
 s=c.splines.new('POLY');s.points.add(len(points)-1)
 for p,v in zip(s.points,points):p.co=(*v,1)
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(mat);return parent(o,group)
def empty(name,group=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o)
 if group:o.parent=group
 return o
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,p,energy,size,color,target=(0,0,0)):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=rgb(color)
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=p;aim(o,target)
def all_rendered(group):return [o for o in group.children_recursive if o.type in ('MESH','CURVE')]
def bounds(group,cam,scene):
 w,h=scene.render.resolution_x,scene.render.resolution_y
 pts=[]
 for o in all_rendered(group):
  for corner in o.bound_box:
   p=world_to_camera_view(scene,cam,o.matrix_world@Vector(corner));pts.append((p.x*w,(1-p.y)*h))
 return [min(x[0] for x in pts),min(x[1] for x in pts),max(x[0] for x in pts),max(x[1] for x in pts)]

def build(ratio,cfg):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=32 if preview else 160;s.cycles.use_denoising=True
 s.cycles.seed=20261011;s.cycles.max_bounces=8
 prefs=bpy.context.preferences.addons['cycles'].preferences
 try:
  prefs.compute_device_type='OPTIX';prefs.get_devices()
  found=False
  for d in prefs.devices:d.use=d.type=='OPTIX';found=found or d.use
  if found:s.cycles.device='GPU'
 except Exception:pass
 s.render.resolution_x,s.render.resolution_y=cfg['size'];s.render.resolution_percentage=50 if preview else 100
 s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.color_depth='8'
 s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.25
 s.world.color=(.8,.8,.8);s.world.use_nodes=True
 s.world.node_tree.nodes['Background'].inputs[0].default_value=(*rgb('#e5efec'),1)
 s.world.node_tree.nodes['Background'].inputs[1].default_value=.48
 teal=material('Sea glass teal','#2eaaa4',.26,.23);gold=material('Warm champagne','#d5ac60',.42,.25)
 coral=material('Soft coral','#dc907b',.12,.27);violet=material('Muted violet','#a3a0cd',.18,.29)
 ink=material('Graphite shell','#223b40',.7,.22);rim=material('Polished rim','#739394',.7,.2)
 dark=material('Screen beneath data','#0d2529',.15,.24);floor_mat=material('Warm ivory','#edf1eb',0,.48)
 floor_shader=next(n for n in floor_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');floor_shader.inputs['Emission Color'].default_value=(*rgb('#edf1eb'),1);floor_shader.inputs['Emission Strength'].default_value=.32
 root=empty('Cover — continuous memory into DNA');phone=empty('Memory device',root);dna=empty('DNA double helix',root);flow=empty('Image fragments',root)
 width,height=4.95,2.7844
 box('Device rim',(0,0,0),(width+.19,.15,height+.19),rim,phone,.09)
 box('Device graphite',(0,-.046,0),(width+.12,.15,height+.12),ink,phone,.085)
 box('Dark screen',(0,-.134,0),(width+.035,.013,height+.035),dark,phone,.012)
 image=bpy.data.images.load(str(ROOT/'public/bridges/family-memory.png'),check_existing=True)
 imat=bpy.data.materials.new('Same family memory as V5');imat.use_nodes=True;n=imat.node_tree.nodes;l=imat.node_tree.links;n.clear();b=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(b.outputs['BSDF'],out.inputs['Surface'])
 tex=n.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear';l.new(tex.outputs['Color'],b.inputs['Base Color']);l.new(tex.outputs['Color'],b.inputs['Emission Color']);b.inputs['Emission Strength'].default_value=.28;b.inputs['Roughness'].default_value=.29
 emission=n.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=.85;l.new(tex.outputs['Color'],emission.inputs['Color']);l.new(emission.outputs['Emission'],out.inputs['Surface'])
 moving=[];nx,ny=16,9
 for j in range(ny):
  for i in range(nx):
   x0=-width/2+i*width/nx;x1=x0+width/nx;z0=-height/2+j*height/ny;z1=z0+height/ny
   lost=(i==15 and j in (2,3,4,5,6,7)) or (i==14 and j in (4,5,6)) or (i==13 and j==5)
   me=bpy.data.meshes.new(f'Image UV {i:02d}-{j:02d}');me.from_pydata([(x0,-.147,z0),(x1,-.147,z0),(x1,-.147,z1),(x0,-.147,z1)],[],[(0,1,2,3)])
   me.uv_layers.new();uvs=[(i/nx,j/ny),((i+1)/nx,j/ny),((i+1)/nx,(j+1)/ny),(i/nx,(j+1)/ny)]
   for uv,xy in zip(me.uv_layers.active.data,uvs):uv.uv=xy
   o=bpy.data.objects.new(f'Memory image tile {i:02d}-{j:02d}',me);bpy.context.collection.objects.link(o);parent(o,phone);o.data.materials.append(imat)
   if lost:
    # Keep a mostly complete, emotionally legible frame; only the outer edge travels.
    q=len(moving);o.location=(.30+.11*q,-.22-.045*q,.10+.12*q);moving.append(o)
 box('Small side button',(width/2+.108,0,.42),(.025,.045,.32),rim,phone,.01)
 phone.location=(-1.85,-.4,-.85 if cfg['portrait'] else -.80);phone.rotation_euler=(math.radians(-8),math.radians(-9),math.radians(-7))
 if cfg['portrait']:phone.scale=(1.10,1.10,1.10);phone.location=(-.58,-.8,-1.38)
 # V5 helix: two antiparallel backbones, 10.5 pairs per turn; conceptual scale.
 H=5.25;radius=.89;pairs=23
 for sign,mat in [(1,teal),(-1,gold)]:
  coords=[]
  for q in range(241):
   a=q/240*(pairs-1)*2*math.pi/10.5+.45;z=(q/240-.5)*H
   coords.append((sign*math.cos(a)*radius,sign*math.sin(a)*radius,z))
  tube('Continuous sugar phosphate backbone',coords,.093,mat,dna)
 for i in range(pairs):
  a=i*2*math.pi/10.5+.45;z=(i/(pairs-1)-.5)*H
  left=(math.cos(a)*radius,math.sin(a)*radius,z);right=(-left[0],-left[1],z)
  for point,col in [(left,teal),(right,gold)]:sphere('Sugar unit',point,.135,col,dna)
  p=Vector(left);r=Vector(right)
  tube('Paired base left',[p, p.lerp(r,.49)],.075,[teal,coral,violet,gold][i%4],dna)
  tube('Paired base right',[p.lerp(r,.51),r],.075,[gold,violet,coral,teal][i%4],dna)
 dna.location=(1.95,.5,.72 if not cfg['portrait'] else 1.30);dna.rotation_euler=(math.radians(5),math.radians(-19),math.radians(-8))
 if cfg['portrait']:dna.location=(1.1,.50,1.40);dna.scale=(1.05,1.05,1.05)
 random.seed(20261011)
 for i in range(18):
  u=i/17;p=(.05+1.8*u,-.20+math.sin(u*math.pi)*.1,-.05+2.1*u)
  o=box('Decoded data fragment',p,(.12,.10,.12),[teal,gold,coral,violet][i%4],flow,.02)
  o.rotation_euler=(random.random(),random.random(),random.random());o.scale=(.75+.45*math.sin(i),)*3
 # Restrained rear bokeh: deliberately outside the explanatory focal plane.
 for i,p in enumerate([(3.2,3.6,1.65),(2.9,3.9,-1.5),(-1.7,4.3,2.6)]):sphere('Out of focus material',p,.09+i*.015,[teal,gold,violet][i],flow)
 camdata=bpy.data.cameras.new('Cover camera');cam=bpy.data.objects.new('Cover camera',camdata);bpy.context.collection.objects.link(cam);s.camera=cam
 cam.location=(0,-23,7.5);aim(cam,(0,0,0));camdata.type='ORTHO';camdata.ortho_scale=14
 bpy.context.view_layer.update()
 # Fit the dedicated arrangement, never crop a finished landscape into a portrait.
 target=cfg['target'];b=bounds(root,cam,s);factor=min((target[2]-target[0])/(b[2]-b[0]),(target[3]-target[1])/(b[3]-b[1]))
 root.scale=(factor,)*3;bpy.context.view_layer.update();b=bounds(root,cam,s)
 up=cam.rotation_euler.to_quaternion()@Vector((0,1,0));right=cam.rotation_euler.to_quaternion()@Vector((1,0,0))
 origin=world_to_camera_view(s,cam,Vector((0,0,0)));one=world_to_camera_view(s,cam,right);per=(one.x-origin.x)*cfg['size'][0]
 dx=(target[0]+target[2]-b[0]-b[2])/2;dy=(target[1]+target[3]-b[1]-b[3])/2
 root.location=right*(dx/per)-up*(dy/per);bpy.context.view_layer.update()
 lowest=min((o.matrix_world@Vector(v)).z for o in all_rendered(root) for v in o.bound_box)
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,lowest-.12));floor=bpy.context.object;floor.name='Seamless photographic floor';floor.data.materials.append(floor_mat)
 center=root.location
 area('Large warm key',center+Vector((-4,-8,10)),2100,8,'#fff2de',center)
 area('Cool rim',center+Vector((5,3,7)),2500,6,'#dbfff8',center)
 area('Front softbox',center+Vector((0,-7,2)),750,5,'#ffffff',center)
 focus=empty('Focus: DNA and family frame');focus.location=phone.matrix_world.translation.lerp(dna.matrix_world.translation,.5)
 camdata.dof.use_dof=True;camdata.dof.focus_object=focus;camdata.dof.aperture_fstop=6.5
 regions={name:bounds(g,cam,s) for name,g in [('family-image',phone),('DNA',dna),('process-fragments',flow)]}
 (ART/f'projection-{ratio}.json').write_text(json.dumps({'size':cfg['size'],'target':target,'regions':regions,'source':'Blender 5.1.2 deterministic 3D scene; photo from V5, schematic DNA scale'},indent=2),encoding='utf8')
 s.render.filepath=str(ART/f'beauty-{ratio}{"-preview" if preview else ""}.png')
 if not preview:
  bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ART/f'DNA-cover-{ratio}.blend'))
 bpy.ops.render.render(write_still=True)
 print('COVER_RENDER_DONE',ratio,s.render.filepath,flush=True)

for ratio,cfg in layouts.items():
 if selected and selected!=ratio:continue
 build(ratio,cfg)
