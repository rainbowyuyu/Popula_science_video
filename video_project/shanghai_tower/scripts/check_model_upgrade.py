"""Model upgrade: fixed views and independently loaded mesh/graph QA."""
import bpy,json,math,hashlib
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'research/model-upgrade';O.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'model/shanghai-tower.blend'))
manifest=json.loads((R/'public/models/shanghai-tower-manifest.json').read_text(encoding='utf8'));graph=json.loads((R/'public/physics/structural-graph.json').read_text(encoding='utf8'))
nodes={n['id']:n for n in graph['nodes']};parts={p['id']:p for p in manifest['parts']};members={m['id']:m for m in graph['members']}
errs=[];ntruss=0
for m in graph['members']:
 if m['role'] not in ('outrigger','belt'):continue
 ob=bpy.data.objects.get(m['meshIds'][0]);assert ob is not None,m['id'];v=[Vector(x.co) for x in ob.data.vertices]
 for j in (0,1):
  points=[v[k+i] for k in range(0,len(v),8) for i in range(4*j,4*j+4)]
  center=sum(points,Vector())/len(points);expected=Vector(nodes[m['nodeIds'][j]]['xyzBlender']);errs.append((center-expected).length)
 ntruss+=1
assert max(errs)<.001,max(errs)
assert all(bpy.data.objects.get(p['id']) is not None for p in parts.values())
assert not any('MEGACOL_Z09' in p for p in parts)
assert all(f'CORNERCOL_Z{z:02d}_C{c:02d}' in parts for z in range(1,6) for c in range(1,5))
assert not any(p.startswith('CORNERCOL_Z06') for p in parts)
assert len({e['id'].split('_')[1] for e in graph['members'] if e['role']=='outrigger'})==6
# Convexity independent polygon cross-product check on exported lower shell edge.
outline=[]
for s in range(1,7):
 ob=bpy.data.objects[f'ENVELOPE_Z01_S{s:02d}_GLASS']
 outline.extend([(v.co.x,v.co.y) for v in ob.data.vertices if abs(v.co.z)<1e-5])
outline=sorted(set(outline),key=lambda p:math.atan2(p[1],p[0]));cross=[]
for i in range(len(outline)):
 a,b,c=outline[i-1],outline[i],outline[(i+1)%len(outline)]
 cross.append((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))
assert min(cross)>0,min(cross)
report={'parts':len(parts),'truss_members_verified':ntruss,'max_render_FE_endpoint_error_m':max(errs),'all_declared_parts_present':True,'mega_column_top_m':542,'corner_column_top_m':314.1,'outrigger_zone_indices':sorted({e['id'].split('_')[1] for e in graph['members'] if e['role']=='outrigger'}),'base_facade_plan_strictly_convex':min(cross)>0,'smallest_turn_crossproduct':min(cross),'glb_sha256':hashlib.sha256((R/'public/models/shanghai-tower.glb').read_bytes()).hexdigest(),'graph_sha256':hashlib.sha256((R/'public/physics/structural-graph.json').read_bytes()).hexdigest(),'limitations':'Visual connection details and intermediate geometry are source-constrained reconstructions; not as-built fabrication schedule.'}
(O/'geometry-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=16;s.cycles.use_denoising=True
s.render.resolution_x=1000;s.render.resolution_y=800;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG'
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.88,.90,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.48;s.view_settings.view_transform='AgX'
for name,loc,power,size in [('Key',(-400,500,800),65000000,600),('Fill',(350,-150,450),28000000,500)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,260))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('QACamera');camera=bpy.data.objects.new('QACamera',d);s.collection.objects.link(camera);s.camera=camera;d.type='ORTHO';d.clip_end=10000
views=[('structural-overview',(-450,700,410),(0,0,278),790),('truss-connection',(-65,95,270),(-5,20,234),78),('core-cells',(-60,85,203),(0,0,164),68)]
for name,loc,target,scale in views:
 for o in bpy.data.objects:
  if o.type!='MESH':continue
  p=parts.get(o.name,{});role=p.get('role');o.hide_render=False
  if name=='structural-overview':o.hide_render=role in ['outerglass','mullions','innerfacade','innerframe','garden','spiralrib','soil','plaza','floors','floorbeams','inspectionfloor','sky_lobby']
  elif name=='truss-connection':o.hide_render=('Z04' not in o.name) or role not in ['core','megacolumn','cornercolumn','outrigger','belt','connection'];o.hide_render|=o.name=='CORE_Z04_W2'
  else:o.hide_render=('Z03' not in o.name) or role!='core';o.hide_render|=o.name=='CORE_Z03_W2'
 camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale
 s.render.filepath=str(O/f'{name}.png');bpy.ops.render.render(write_still=True)
print('UPGRADE_QA_COMPLETE',report)
