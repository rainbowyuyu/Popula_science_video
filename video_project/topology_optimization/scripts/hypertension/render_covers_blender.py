"""Render four separately art-directed, text-free covers from BodyParts3D.
Run: blender --background --python scripts/hypertension/render_covers_blender.py -- [ratio] [preview]
"""
import bpy, math, json, sys, array, random
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parents[1]/'human-atlas-audit/ashemag-human-atlas-1c38bf3/public/models'
OUT=ROOT/'delivery/hypertension/covers';OUT.mkdir(parents=True,exist_ok=True)
ATLAS=json.loads((SOURCE/'atlas.json').read_text())
CHUNKS=[(SOURCE/Path(c['url']).name).read_bytes() for c in ATLAS['chunks']]
PARTS=ATLAS['parts']
RATIOS={'16x9':(1920,1080),'4x3':(1920,1440),'3x4':(1440,1920),'9x16':(1080,1920)}
LAYOUT={
 '16x9':{'heart':(.725,.58,.57,-16),'body':(.90,.50,.85,18),'vessel':(.72,.16,.43,-6)},
 '4x3':{'heart':(.725,.48,.50,-19),'body':(.90,.45,.76,12),'vessel':(.665,.13,.48,-7)},
 '3x4':{'heart':(.55,.405,.415,-16),'body':(.875,.365,.52,16),'vessel':(.50,.095,.76,-8)},
 '9x16':{'heart':(.55,.405,.405,-18),'body':(.89,.36,.52,20),'vessel':(.48,.10,.88,-9)},
}

def srgb(h):
 vals=[int(h[i:i+2],16)/255 for i in(0,2,4)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals)+(1,)

def mat(name,color,rough=.4,alpha=1,sss=0):
 m=bpy.data.materials.new(name);m.diffuse_color=srgb(color);m.use_nodes=True
 n=m.node_tree.nodes;bs=n.get('Principled BSDF');bs.inputs['Base Color'].default_value=srgb(color);bs.inputs['Roughness'].default_value=rough
 bs.inputs['Subsurface Weight'].default_value=sss
 if sss>0:
  noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=260;noise.inputs['Detail'].default_value=2.5
  bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.065;bump.inputs['Distance'].default_value=.015
  m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
 if alpha<1:
  out=n.get('Material Output');t=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');mix.inputs[0].default_value=alpha
  m.node_tree.links.new(t.outputs[0],mix.inputs[1]);m.node_tree.links.new(bs.outputs[0],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],out.inputs[0])
 return m

def meshparts(name,parts,material,minimum_y=None):
 vertices=[];faces=[]
 for p in parts:
  b=CHUNKS[p['chunk']];vv=array.array('f');vv.frombytes(b[p['positions']:p['positions']+p['vertexCount']*12]);ix=array.array('I');ix.frombytes(b[p['indices']:p['indices']+p['indexCount']*4]);base=len(vertices)
  vertices.extend((vv[i],-vv[i+2],vv[i+1]) for i in range(0,len(vv),3))
  faces.extend(tuple(base+ix[i+k] for k in range(3)) for i in range(0,len(ix),3) if minimum_y is None or min(vv[ix[i+k]*3+1] for k in range(3))>=minimum_y)
 me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(material)
 for f in me.polygons:f.use_smooth=True
 return o

def normalize(objects,name):
 pts=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
 lo=Vector([min(v[i] for v in pts) for i in range(3)]);hi=Vector([max(v[i] for v in pts) for i in range(3)]);center=(lo+hi)/2;scale=1/(hi.z-lo.z)
 group=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(group)
 for o in objects:
  for v in o.data.vertices:v.co=(v.co-center)*scale
  o.parent=group
 return group

def area(name,location,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=srgb(color)[:3]
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()

def rbc(name,center,size,material):
 vs=[];fs=[];rings=12;n=28
 # Closed biconcave disc, a schematic erythrocyte rather than a blood clot.
 for j in range(rings+1):
  t=math.pi*j/rings;r=math.sin(t);z=math.cos(t)*(.28+.42*r*r)
  for i in range(n):
   a=2*math.pi*i/n;vs.append((size*r*math.cos(a),size*r*math.sin(a),size*z*.5))
 for j in range(rings):
  for i in range(n):k=j*n+i;kk=j*n+(i+1)%n;fs.append((k,kk,kk+n,k+n))
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(material);o.location=center;o.rotation_euler=(.4,.6,.5)
 for p in me.polygons:p.use_smooth=True
 return o

def cutaway(materials):
 g=bpy.data.objects.new('Arteriole_cutaway_schematic',None);bpy.context.collection.objects.link(g)
 length=3.9;radius=.51;thick=.12;n=80;m=48;vs=[];fs=[];mi=[]
 # Front wall removed. Smooth muscle narrowing is distributed, with no plaque.
 for layer in range(2):
  for j in range(n+1):
   x=length*(j/n-.5);r=radius*(1-.22*math.exp(-(x/1.2)**2))-(thick if layer else 0)
   for i in range(m+1):
    a=math.radians(232)+(math.radians(256))*i/m;vs.append((x,r*math.cos(a),r*math.sin(a)))
 stride=(n+1)*(m+1)
 for layer in range(2):
  for j in range(n):
   for i in range(m):k=layer*stride+j*(m+1)+i;fs.append((k,k+1,k+m+2,k+m+1));mi.append(layer)
 for j in [0,n]:
  for i in range(m):k=j*(m+1)+i;fs.append((k,k+1,k+1+stride,k+stride));mi.append(2)
 for i in[0,m]:
  for j in range(n):k=j*(m+1)+i;fs.append((k,k+m+1,k+m+1+stride,k+stride));mi.append(2)
 me=bpy.data.meshes.new('Cutaway_vessel');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Cutaway_vessel',me);bpy.context.collection.objects.link(o);o.parent=g
 for material in materials[:3]:me.materials.append(material)
 for p,index in zip(me.polygons,mi):p.material_index=index;p.use_smooth=True
 # Subtle smooth-muscle bands on the exterior show a contractile wall.
 for x in[-1.35,-.75,-.15,.45,1.05,1.65]:
  r=radius*(1-.22*math.exp(-(x/1.2)**2))+.011;curve=bpy.data.curves.new('Smooth_muscle_band','CURVE');curve.dimensions='3D';curve.bevel_depth=.022;curve.bevel_resolution=3;s=curve.splines.new('POLY');s.points.add(42)
  for i,p in enumerate(s.points):a=math.radians(232)+math.radians(256)*i/42;p.co=(x,r*math.cos(a),r*math.sin(a),1)
  o=bpy.data.objects.new('Smooth_muscle_band',curve);bpy.context.collection.objects.link(o);curve.materials.append(materials[3]);o.parent=g
 for k,(x,y,z) in enumerate([(-1.65,-.10,.05),(-.75,-.1,-.04),(.25,-.08,.05),(1.1,-.13,-.04)]):
  o=rbc('Blood_cell_'+str(k),(x,y,z),.16,materials[4]);o.parent=g
 return g

def scene(ratio,preview):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=40 if preview else 72;sc.cycles.use_denoising=True
 try:
  pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='OPTIX';pref.get_devices()
  gpu=False
  for d in pref.devices:d.use=d.type!='CPU';gpu|=d.use
  if gpu:sc.cycles.device='GPU'
 except Exception:pass
 sc.cycles.max_bounces=8;sc.cycles.transparent_max_bounces=10
 w,h=RATIOS[ratio];scale=.50 if preview else 1;sc.render.resolution_x=int(w*scale);sc.render.resolution_y=int(h*scale);sc.render.resolution_percentage=100
 sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.film_transparent=True
 sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=.45
 world=bpy.data.worlds.new('Ivory_studio');sc.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=srgb('f3eee5');world.node_tree.nodes['Background'].inputs[1].default_value=.7
 heartmat=mat('Rose_heart','a94246',.37,sss=.055);arterymat=mat('Rose_arterial','ab4a4e',.35,sss=.03);coronarymat=mat('Coronary_teal','5c9392',.4)
 skinmat=mat('Porcelain_reference','cbd8d0',.65,.10);bodyart=mat('Reference_arteries','829c93',.5,.65);bodyvein=mat('Reference_veins','7ea9a8',.55,.5)
 heartparts=[p for p in PARTS if p['id'] in {'FJ2428','FJ2438','FJ2439'}]
 main=meshparts('Real_heart_walls',heartparts,heartmat);sub=main.modifiers.new('Render_surface_refinement','SUBSURF');sub.levels=1;sub.render_levels=1
 arch=meshparts('Real_ascending_aorta_arch',[p for p in PARTS if p['id'] in {'FJ3411','FJ3413'}],arterymat)
 coronary=meshparts('Coronary_reference',[p for p in PARTS if ('coronary' in p['name'].lower() or 'cardiac vein' in p['name'].lower()) and p['bounds'][0][1]>1.20 and p['bounds'][1][1]<1.42],coronarymat)
 heart=normalize([main,arch,coronary],'Heart_hero')
 bodyskin=meshparts('Body_reference_skin',[p for p in PARTS if p['id']=='FJ2810'],skinmat,minimum_y=.82)
 bodyartery=meshparts('Body_reference_arteries',[p for p in PARTS if p['system']=='arterial' and p['bounds'][1][1]>.85],bodyart,minimum_y=.82)
 bodyveins=meshparts('Body_reference_veins',[p for p in PARTS if p['system']=='venous' and p['bounds'][1][1]>.85],bodyvein,minimum_y=.82)
 body=normalize([bodyskin,bodyartery,bodyveins],'Circulation_reference')
 vessel=cutaway([mat('Vessel_outer','bc615e',.46,sss=.045),mat('Vessel_lumen','e7b3a4',.48),mat('Vessel_cut_surface','f2c6b6',.54),mat('Muscle_rings','a94f50',.43),mat('Red_cells','9d3440',.39,sss=.035)])
 camd=bpy.data.cameras.new('Cover_camera');cam=bpy.data.objects.new('Cover_camera',camd);bpy.context.collection.objects.link(cam);sc.camera=cam
 cam.location=(0,-22,3.5);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=10*w/h if w>=h else 10
 # Blender ortho_scale is horizontal for a landscape sensor and vertical for portrait.
 # Derive actual visible dimensions from aspect ratio explicitly.
 camd.ortho_scale=10
 visible_w=10 if w>=h else 10*w/h;visible_h=10*h/w if w>=h else 10
 right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0));forward=cam.rotation_euler.to_matrix()@Vector((0,0,-1))
 def place(group,kind,depth):
  x,y,size,rz=LAYOUT[ratio][kind];group.location=right*((x-.5)*visible_w)+up*((y-.5)*visible_h)+forward*depth
  s=size*visible_h if kind!='vessel' else size*visible_w/3.9;group.scale=(s,s,s);group.rotation_euler.z=math.radians(rz)
  if kind=='heart':group.rotation_euler.x=math.radians(4)
  if kind=='vessel':group.rotation_euler.z=math.radians(14 if ratio in['16x9','4x3'] else 6);group.rotation_euler.y=math.radians(-10);group.rotation_euler.x=math.radians(-5)
 place(body,'body',2.5);place(heart,'heart',0);place(vessel,'vessel',-.8)
 # The background reference is physically further away for a soft depth cue.
 focus=bpy.data.objects.new('Heart_focus',None);bpy.context.collection.objects.link(focus);focus.location=heart.location;camd.dof.use_dof=True;camd.dof.focus_object=focus;camd.dof.aperture_fstop=5.6
 area('Large_warm_key',(-6,-8,10),1650,7,'fff4e5');area('Soft_teal_fill',(7,-4,5),1050,8,'e7f2f3');area('Ivory_rim',(3,5,9),1750,5,'fff8ec')
 # Oversized backdrop gives a soft vertical gradient without a boxed panel.
 # Saving one native scene makes the materials and anatomical source editable.
 if not preview:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('source-'+ratio+'.blend')))
 sc.render.filepath=str(OUT/('art-'+ratio+('-preview' if preview else '')+'.png'));bpy.ops.render.render(write_still=True)
 info={'ratio':ratio,'resolution':[w,h],'layout':LAYOUT[ratio],'source':'BodyParts3D 4.0 via ashemag/human-atlas 1c38bf3','anatomy':'Actual heart walls, ascending aorta/arch, coronary vessels, cropped upper-body skin and arterial/venous networks','schematic':'Foreground cutaway arteriole and erythrocytes are manually modeled mechanism illustration; not a patient simulation','renderer':'Blender Cycles','samples':sc.cycles.samples}
 (OUT/('art-'+ratio+'.json')).write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf8')

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
selected=[args[0]] if args and args[0] in RATIOS else list(RATIOS)
for ratio in selected:scene(ratio,'preview' in args)
