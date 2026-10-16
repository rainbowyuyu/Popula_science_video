"""Isolated repair of the square hip-roof pavilion: real joints and assembly.

Run: D:/blender/blender.exe --background --factory-startup --python build_pavilion_v7.py
All construction coordinates are metres, Blender Z-up. Nothing overwrites v6.
The asset is exported in the assembled rest pose, with no glTF animations.
"""
import bpy, bmesh, json, math, itertools, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

HERE=Path(__file__).resolve().parent
PROJECT=HERE.parent/'topology_optimization'
OUT=HERE/'blender/v7'
PUBLIC=PROJECT/'public/episode3v7/models'
RESEARCH=PROJECT/'research/episode3v7'
for d in (OUT,PUBLIC,RESEARCH): d.mkdir(parents=True,exist_ok=True)
PARTS={}; JOINTS=[]; ROOTS={}; MEMBERS=[]; NODES=[]; LINKS=[]; NODE_KEYS={}; PANELS=[]
CLEARANCE=.0008
C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))

def savej(path,data): path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
def three(v): return [round(float(v[0]),6),round(float(v[2]),6),round(-float(v[1]),6)]
def mat(name,col,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough
 if name.startswith('wood'):
  n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=6;n.inputs['Detail'].default_value=2
  t=m.node_tree.nodes.new('ShaderNodeTexCoord');s=m.node_tree.nodes.new('ShaderNodeVectorMath');s.operation='MULTIPLY';s.inputs[1].default_value=(2,32,32)
  m.node_tree.links.new(t.outputs['Generated'],s.inputs[0]);m.node_tree.links.new(s.outputs[0],n.inputs['Vector'])
  ramp=m.node_tree.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[1].position=.8
  ramp.color_ramp.elements[0].color=(*(c*.78 for c in col),1);ramp.color_ramp.elements[1].color=(*(min(c*1.16,1) for c in col),1)
  m.node_tree.links.new(n.outputs['Fac'],ramp.inputs[0]);m.node_tree.links.new(ramp.outputs[0],p.inputs['Base Color'])
 return m
def group(name):
 if name not in ROOTS:
  o=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(o);ROOTS[name]=o
 return ROOTS[name]
def cube(name,center,dim):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.dimensions=dim
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return o
def cyl(name,center,radius,length,axis):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=length,location=center);o=bpy.context.object;o.name=name
 o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);return o
def mesh(name,vertices,faces):
 m=bpy.data.meshes.new(name+'_mesh');m.from_pydata(vertices,[],faces);m.update()
 bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(m);bm.free()
 o=bpy.data.objects.new(name,m);bpy.context.scene.collection.objects.link(o);return o
def poly_prism(name,points,axis,width):
 # points are local coordinates in the horizontal-run / vertical plane.
 vs=[]
 for q in [-width/2,width/2]:
  for run,z in points: vs.append((run,q,z) if axis=='x' else (q,run,z))
 n=len(points);fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,vs,fs)
def slope_panel(name,xy,top,thick):
 vs=[(x,y,top(x,y)+dz) for dz in [-thick,0] for x,y in xy];n=len(xy)
 fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,vs,fs)
def boolop(a,b,op='DIFFERENCE',remove=True):
 bpy.context.view_layer.objects.active=a;mod=a.modifiers.new('precision joinery','BOOLEAN');mod.operation=op;mod.solver='EXACT';mod.object=b
 bpy.ops.object.modifier_apply(modifier=mod.name)
 if remove: bpy.data.objects.remove(b,do_unlink=True)
 return a
def union(a,b): return boolop(a,b,'UNION')
def copy_cutter(obj,expand=.0):
 o=obj.copy();o.data=obj.data.copy();bpy.context.scene.collection.objects.link(o);o.animation_data_clear()
 if expand:
  # Actual uniformly offset cutter geometry is not needed for the sampled
  # bearing seats; only mortise boxes use the explicit 0.8 mm face allowance.
  cen=sum((Vector(v) for v in o.bound_box),Vector())/8
  for v in o.data.vertices:
   d=v.co-cen;v.co=cen+Vector(tuple(d[i]+math.copysign(expand,d[i]) if abs(d[i])>1e-8 else d[i] for i in range(3)))
 return o
def addpart(obj,pid,role,parent,label,axis=None):
 obj.name=pid;obj.data.name=pid+'_mesh';obj.parent=group(parent);obj.data.materials.clear();obj.data.materials.append(MATS['stone' if role=='stone' else 'tile' if role=='tile' else 'peg' if role=='peg' else 'wood'])
 for f in obj.data.polygons:f.material_index=0
 # Mesh data remains in author coordinates; object origin is moved to the
 # physical bounding-box centre.  A stable rest matrix accompanies the GLB.
 bpy.context.view_layer.update();cen=sum((obj.matrix_world@Vector(v) for v in obj.bound_box),Vector())/8
 bpy.context.scene.cursor.location=cen;bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
 obj['part_id']=pid;obj['role']=role;obj['label_zh']=label;obj['physical_piece']=True
 PARTS[pid]={'obj':obj,'id':pid,'role':role,'parent':parent,'label_zh':label,'axis':axis,'assembled_matrix':obj.matrix_world.copy()}
 return obj
def joint(jid,kind,male,female,axis,focus,**extra):
 JOINTS.append(dict(id=jid,kind=kind,male=male,female=female,axis_blender=list(axis),focus_blender=list(focus),focus_three=three(focus),**extra))
def node(xyz,fix=False):
 key=tuple(round(float(x),6) for x in xyz)
 if key in NODE_KEYS:return NODE_KEYS[key]
 n=len(NODES)+1;NODE_KEYS[key]=n;NODES.append({'id':n,'xyz':list(key),'fix':[1]*6 if fix else [0]*6});return n
def member(pid,a,b,width,depth,role,roll=(0,0,1)):
 if (Vector(b)-Vector(a)).length<1e-6:return
 if abs((Vector(b)-Vector(a)).normalized().dot(Vector(roll).normalized()))>.98:roll=(0,1,0)
 MEMBERS.append({'id':len(MEMBERS)+1,'part_id':pid,'nodes':[node(a),node(b)],'section':{'b':width,'h':depth},'material':{'E':9e9,'G':.56e9,'rho':460},'roll_vec':list(roll),'role':role})
def link(a,b,owner):
 m,s=node(a),node(b)
 if m!=s: LINKS.append({'master':m,'slave':s,'owner_part_id':owner})
def clip_poly(poly,axis,bound,keep_less=True):
 out=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  fa=(a[axis]-bound)*(1 if keep_less else -1);fb=(b[axis]-bound)*(1 if keep_less else -1)
  if fa<=0:out.append(a)
  if (fa<=0)!=(fb<=0):
   t=fa/(fa-fb);out.append(tuple(a[k]+t*(b[k]-a[k]) for k in range(2)))
 return out

def build():
 # Foundation, four square timber columns, and two complete X-direction bents.
 addpart(cube('',(0,0,0),(5.1,5.1,.16)),'PLINTH','stone','FOUNDATION','石台基')
 for suffix,x,y in [('FL',-1.5,-1.5),('FR',1.5,-1.5),('BL',-1.5,1.5),('BR',1.5,1.5)]:
  addpart(cube('',(x,y,.24),(.52,.52,.32)),'STONE_'+suffix,'stone','FOUNDATION','独立石础')
  post=cube('',(x,y,2.015),(.28,.28,3.23))
  # X and Y mortises are through slots at different elevations. They never
  # intersect. Closed bents are assembled around the beams, not vice versa.
  boolop(post,cube('',(x,y,3.00),(.32,.1016,.1416)))
  boolop(post,cube('',(x,y,3.42),(.0816,.32,.1216)))
  addpart(post,'POST_'+suffix,'post','BENT_'+('FRONT' if y<0 else 'BACK'),'柱：错层贯穿卯')
  node((x,y,.40),True)
 for name,y in [('FRONT',-1.5),('BACK',1.5)]:
  beam=cube('',(0,y,3.0),(2.72,.22,.30))
  for s in [-1,1]:union(beam,cube('',(s*1.499,y,3.0),(.282,.10,.14)))
  addpart(beam,'CROSS_'+name,'beam','BENT_'+name,'穿梁：一木两端榫','x')
 for side,x in [('LEFT',-1.5),('RIGHT',1.5)]:
  beam=cube('',(x,0,3.42),(.14,2.72,.24))
  for s in [-1,1]:union(beam,cube('',(x,s*1.499,3.42),(.08,.282,.12)))
  addpart(beam,'LONG_'+side,'beam','LONGITUDINAL_FRAME','纵枋：一木两端榫','y')
 # Eight integral housed knee braces: upper vertical tenon into the beam;
 # lower horizontal tenon into the post. This permits the stated bent-first
 # and frame-closing assembly paths and provides an explicit lateral path.
 for suffix,x,y in [('FL',-1.5,-1.5),('FR',1.5,-1.5),('BL',-1.5,1.5),('BR',1.5,1.5)]:
  for axis,zlower,beamz,bodyh in [('x',2.10,3.0,.30),('y',2.42,3.42,.24)]:
   s=math.copysign(1,x if axis=='x' else y);face=s*1.36;upper=s*.78;zupper=beamz-bodyh/2
   p,q=Vector((face,zlower)),Vector((upper,zupper));d=(q-p).normalized();n=Vector((-d.y,d.x));poly=[tuple(p-d*.30-n*.065),tuple(q+d*.30-n*.065),tuple(q+d*.30+n*.065),tuple(p-d*.30+n*.065)]
   poly=clip_poly(poly,0,face,keep_less=s>0);poly=clip_poly(poly,1,zupper)
   body=poly_prism('',poly,axis,.10)
   if axis=='x':
    body.location.y=y;lowcen=(face+s*.049,y,zlower);upcen=(upper,y,zupper+.044)
    lowdim=(.102,.08,.10);updim=(.08,.08,.092);target=PARTS['CROSS_'+('FRONT' if y<0 else 'BACK')]['obj']
   else:
    body.location.x=x;lowcen=(x,face+s*.049,zlower);upcen=(x,upper,zupper+.044)
    lowdim=(.08,.102,.10);updim=(.08,.08,.092);target=PARTS['LONG_'+('LEFT' if x<0 else 'RIGHT')]['obj']
   union(body,cube('',lowcen,lowdim));union(body,cube('',upcen,updim))
   boolop(PARTS['POST_'+suffix]['obj'],cube('',lowcen,tuple(v+2*CLEARANCE for v in lowdim)))
   boolop(target,cube('',upcen,tuple(v+2*CLEARANCE for v in updim)))
   pid='BRACE_'+axis.upper()+'_'+suffix;parent='BENT_'+('FRONT' if y<0 else 'BACK') if axis=='x' else 'LONGITUDINAL_FRAME'
   addpart(body,pid,'brace',parent,'抱肩斜撑：上直榫、下横榫',axis)
   joint('J_'+pid+'_LOW','housed brace tenon',pid,'POST_'+suffix,(s if axis=='x' else 0,s if axis=='y' else 0,0),lowcen,clearance_per_face_m=CLEARANCE)
   joint('J_'+pid+'_UP','vertical brace tenon',pid,target.name,(0,0,1),upcen,clearance_per_face_m=CLEARANCE)
   a=(face,y,zlower) if axis=='x' else (x,face,zlower);b=(upper,y,zupper) if axis=='x' else (x,upper,zupper)
   member(pid,a,b,.10,.13,'brace');link((x,y,zlower),a,'POST_'+suffix)
   bp=(upper,y,beamz) if axis=='x' else (x,upper,beamz);link(bp,b,target.name)
 # Matching round peg holes in both members, and actual removable pins.
 for suffix,x,y in [('FL',-1.5,-1.5),('FR',1.5,-1.5),('BL',-1.5,1.5),('BR',1.5,1.5)]:
  for axis,z,beamid,pinaxis in [('X',3.0,'CROSS_'+('FRONT' if y<0 else 'BACK'),(0,1,0)),('Y',3.42,'LONG_'+('LEFT' if x<0 else 'RIGHT'),(1,0,0))]:
   for pid in ['POST_'+suffix,beamid]:boolop(PARTS[pid]['obj'],cyl('',(x,y,z),.0148,.40,pinaxis))
   parent='BENT_'+('FRONT' if y<0 else 'BACK') if axis=='X' else 'LOCK_PEGS'
   pin=addpart(cyl('',(x,y,z),.014,.34,pinaxis),'PEG_'+axis+'_'+suffix,'peg',parent,'贯穿木销')
   joint('J_'+axis+'_'+suffix,'pegged through tenon',beamid,'POST_'+suffix,(1,0,0) if axis=='X' else (0,1,0),(x,y,z),peg=pin.name,peg_axis_blender=list(pinaxis),peg_radius_m=.014,hole_radius_m=.0148,tenon_section_m=[.10,.14] if axis=='X' else [.08,.12],mortise_section_m=[.1016,.1416] if axis=='X' else [.0816,.1216],clearance_per_face_m=CLEARANCE)
 # Column-top bearing blocks and crossed arms. The bottom block has a true
 # housed tongue cut into the column head, and each arm bears on a real ledge.
 for suffix,x,y in [('FL',-1.5,-1.5),('FR',1.5,-1.5),('BL',-1.5,1.5),('BR',1.5,1.5)]:
  post=PARTS['POST_'+suffix]['obj'];boolop(post,cube('',(x,y,3.595),(.1416,.1416,.0756)))
  block=cube('',(x,y,3.69),(.34,.34,.12));union(block,cube('',(x,y,3.595),(.14,.14,.074)))
  addpart(block,'DOU_'+suffix,'bracket','BRACKETS','栌斗：坐榫承柱')
  armx=cube('',(x,y,3.81),(.64,.16,.12));boolop(armx,cube('',(x,y,3.84),(.1616,.70,.0616)))
  army=cube('',(x,y,3.81),(.16,.64,.12));boolop(army,cube('',(x,y,3.78),(.70,.1616,.0616)))
  addpart(armx,'GONG_X_'+suffix,'bracket','BRACKETS','横向栱：实口交搭')
  addpart(army,'GONG_Y_'+suffix,'bracket','BRACKETS','纵向栱：交叉承托')
  # Cap seats on the crossed arms and carries the eave purlins.
  cap=cube('',(x,y,3.935),(.38,.38,.13));addpart(cap,'CAP_'+suffix,'bracket','BRACKETS','承檩斗：上下实面接触')
  joint('J_DOU_'+suffix,'column-top housed tenon','DOU_'+suffix,'POST_'+suffix,(0,0,1),(x,y,3.63),clearance_per_face_m=CLEARANCE)
 # Eave purlins ring. X rails are low-half and Y rails high-half at corners.
 for name,y in [('FRONT',-1.5),('BACK',1.5)]:
  p=cube('',(0,y,4.07),(3.38,.18,.14))
  for x in [-1.5,1.5]:boolop(p,cube('',(x,y,4.105),(.1816,.22,.0716)))
  addpart(p,'PURLIN_X_'+name,'purlin','PURLINS','檐檩：柱头交搭承托','x')
 for name,x in [('LEFT',-1.5),('RIGHT',1.5)]:
  p=cube('',(x,0,4.07),(.18,3.38,.14))
  for y in [-1.5,1.5]:boolop(p,cube('',(x,y,4.035),(.22,.1816,.0716)))
  addpart(p,'PURLIN_Y_'+name,'purlin','PURLINS','檐檩：柱头交搭承托','y')
 # A real cross of support timbers under the central short post removes the
 # suspended hub from the old asset and closes the load path to the purlins.
 for axis in ['X','Y']:
  dim=(3.18,.16,.14) if axis=='X' else (.16,3.18,.14)
  p=cube('',(0,0,4.07),dim)
  cutz=4.105 if axis=='X' else 4.035
  cutdim=(.1616,.20,.0716) if axis=='X' else (.20,.1616,.0716)
  boolop(p,cube('',(0,0,cutz),cutdim))
  # Housed upper-half ends sit in upward-open purlin pockets.
  for sign in [-1,1]:
   cen=(sign*1.5,0,4.035) if axis=='X' else (0,sign*1.5,4.035)
   boolop(p,cube('',cen,(.182,.20,.0716) if axis=='X' else (.20,.182,.0716)))
   target=PARTS[('PURLIN_Y_'+('LEFT' if sign<0 else 'RIGHT')) if axis=='X' else ('PURLIN_X_'+('FRONT' if sign<0 else 'BACK'))]['obj']
   hole=(sign*1.5,0,4.105) if axis=='X' else (0,sign*1.5,4.105)
   boolop(target,cube('',hole,(.22,.1616,.0716) if axis=='X' else (.1616,.22,.0716)))
  addpart(p,'SUPPORT_'+axis,'beam','ROOF_SUPPORT','十字托梁：承中央短柱',axis.lower())
 short=cube('',(0,0,4.455),(.16,.16,.63));union(short,cube('',(0,0,4.114),(.08,.08,.060)))
 boolop(PARTS['SUPPORT_Y']['obj'],cube('',(0,0,4.114),(.0816,.0816,.0616)))
 addpart(short,'CENTRE_POST','post','ROOF_SUPPORT','中央短柱：下接十字托梁')
 hub=cube('',(0,0,4.97),(.64,.64,.40));boolop(hub,cube('',(0,0,4.796),(.0816,.0816,.054)))
 union(PARTS['CENTRE_POST']['obj'],cube('',(0,0,4.794),(.08,.08,.054)))
 addpart(hub,'HUB','hub','ROOF_SUPPORT','四向攒尖座：由中央短柱承托')
 joint('J_CENTRE_FOOT','vertical mortise tenon','CENTRE_POST','SUPPORT_Y',(0,0,1),(0,0,4.14),clearance_per_face_m=CLEARANCE)
 joint('J_HUB_FOOT','vertical mortise tenon','CENTRE_POST','HUB',(0,0,1),(0,0,4.77),clearance_per_face_m=CLEARANCE)
 # Hip timbers have matching non-intersecting radial tenons, one on each
 # corner of a solid supported hub. They slide radially inward while their
 # lower seats approach the eave purlins from above.
 roof=lambda x,y:5.16-.60*max(abs(x),abs(y))
 for suffix,sx,sy in [('FL',-1,-1),('FR',1,-1),('BL',-1,1),('BR',1,1)]:
  d=Vector((sx/math.sqrt(2),sy/math.sqrt(2),0));t0=.41;t1=math.sqrt(2)*2.30
  top=lambda t:5.16-.60*t/math.sqrt(2)
  tangent=Vector((-d.y,d.x,0));corners=[d*t0-tangent*.09,d*t1-tangent*.09,d*t1+tangent*.09,d*t0+tangent*.09]
  h=slope_panel('',[(p.x,p.y) for p in corners],roof,.24)
  tenon=cube('',d*.315+Vector((0,0,4.864)),(.212,.10,.10));tenon.rotation_euler.z=math.atan2(d.y,d.x)
  # Socket includes the tenon clearance, plus a shallow housed shoulder for
  # the physical .18 m wide hip, with four cavities separated at the centre.
  socket=cube('',d*.315+Vector((0,0,4.864)),(.2136,.1016,.1016));socket.rotation_euler.z=math.atan2(d.y,d.x);boolop(hub,socket)
  # Cut matching shoulder region in the hub so the hip body never intersects.
  shoulder=copy_cutter(h,.001);boolop(hub,shoulder)
  # The upper opening is closed by the final cap, not by an impossible solid
  # ceiling during installation. The tenon bears on a horizontal pocket floor;
  # the four radial pockets stop short of the central short-post mortise.
  open_tail=cube('',d*.314+Vector((0,0,5.1566)),(.2136,.1016,.6868));open_tail.rotation_euler.z=math.atan2(d.y,d.x);boolop(hub,open_tail)
  open_shoulder=cube('',d*.595+Vector((0,0,5.0)),(.3716,.1836,.80));open_shoulder.rotation_euler.z=math.atan2(d.y,d.x);boolop(hub,open_shoulder)
  union(h,tenon)
  for p in [v['obj'] for k,v in PARTS.items() if k.startswith(('PURLIN_','CAP_'))]:
   # A birdsmouth has an open underside. Copying the lower half-lap void of
   # the purlin would leave a hidden hook on the hip that could not lower
   # vertically. Use the entire bearing envelope for this open seat.
   lo,hi=bounds(p);cen=[(lo[i]+hi[i])/2 for i in range(3)];dim=[hi[i]-lo[i]+.0002 for i in range(3)]
   boolop(h,cube('',cen,dim))
  addpart(h,'HIP_'+suffix,'hip','HIP_FRAME','大角梁：径向榫入攒尖座')
  joint('J_HIP_'+suffix,'open-top radial housed tenon with cap','HIP_'+suffix,'HUB',list(d),(d.x*.315,d.y*.315,4.864),clearance_per_face_m=CLEARANCE,retaining_part='FINIAL')
 # Common jack rafters lie on the actual pyramid planes. Their outer seat is
 # a cut birdsmouth on the eave purlin; their inner end is housed in the hips.
 count=11
 for side in range(4):
  for i in range(count):
   u=-1.32+2.64*i/(count-1);inner=max(abs(u)+.045,.30 if abs(u)<.01 else .34);outer=2.30
   # Plane-local coordinates (u fixed across the slope, t down the slope).
   def xy(t):return [(u,-t),(t,u),(u,t),(-t,u)][side]
   verts=[]
   for zoff in [-.14,0]:
    for t,w in [(inner,-.0375),(outer,-.0375),(outer,.0375),(inner,.0375)]:
     x,y=xy(t)
     if side in [0,2]:x+=w
     else:y+=w
     verts.append((x,y,roof(x,y)+zoff))
   r=mesh('',verts,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
   for pk,pv in PARTS.items():
    if not pk.startswith(('PURLIN_','CAP_','SUPPORT_')):continue
    p=pv['obj']
    if pk.startswith('SUPPORT_'):
     # An open birdsmouth must not inherit the support's half-lap void.
     # Its full bearing envelope removes the tiny underside hook which
     # otherwise catches the support during the final vertical descent.
     lo,hi=bounds(p);cen=[(lo[j]+hi[j])/2 for j in range(3)];dim=[hi[j]-lo[j]+.0002 for j in range(3)]
     boolop(r,cube('',cen,dim))
    else:boolop(r,copy_cutter(p))
   pid=f'RAF_{side}_{i:02d}';addpart(r,pid,'rafter','RAFTERS','椽：檐口坐槽、角梁承托')
   # Female sockets open upward, so rafters install by vertical lowering.
   for hp in ['HIP_FL','HIP_FR','HIP_BL','HIP_BR']:
    hc=copy_cutter(r);boolop(PARTS[hp]['obj'],hc)
   # Middle rafters meet the supported hub rather than a hovering apex.
   boolop(hub,copy_cutter(r))
   axy=xy(inner);bxy=xy(outer);midxy=xy(1.5)
   a=(*axy,roof(*axy)-.07);b=(*bxy,roof(*bxy)-.07);mid=(*midxy,roof(*midxy)-.07)
   member(pid,a,mid,.075,.14,'rafter');member(pid,mid,b,.075,.14,'rafter')
   # Actual support points are exported for the solver with eccentric links.
   if abs(u)>.36:
    sx=math.copysign(1,axy[0]);sy=math.copysign(1,axy[1]);q=(sx*abs(u),sy*abs(u),roof(sx*abs(u),sy*abs(u))-.12)
    link(q,a,'HIP_'+('F' if sy<0 else 'B')+('L' if sx<0 else 'R'))
   else:link((0,0,4.97),a,'HUB')
   link((*midxy,4.07),mid,'PURLIN_'+(['X_FRONT','Y_RIGHT','X_BACK','Y_LEFT'][side]))
   joint('J_'+pid,'birdsmouth and housed hip seat',pid,'HIP_FRAME',(0,0,1),(*midxy,4.14),secondary_support='PURLINS')
 # Rebuild the central seat using only prismatic, upward-open cutter boxes.
 # This avoids Boolean sliver edges from repeatedly copying tapered rafters
 # into a concave block, while preserving the exact same supported hub size.
 bpy.data.objects.remove(PARTS['HUB']['obj'],do_unlink=True)
 hub=cube('',(0,0,4.97),(.64,.64,.40))
 boolop(hub,cube('',(0,0,4.796),(.0816,.0816,.054)))
 for sx,sy in [(-1,-1),(1,-1),(-1,1),(1,1)]:
  d=Vector((sx/math.sqrt(2),sy/math.sqrt(2),0));angle=math.atan2(d.y,d.x)
  for t,z,dim in [(.314,5.1566,(.2168,.1016,.6868)),(.6025,5.0,(.39,.1836,.80))]:
   c=cube('',d*t+Vector((0,0,z)),dim);c.rotation_euler.z=angle;boolop(hub,c)
 for side in range(4):
  # The four centre rafters are actually housed into the hub; their ends are
  # not separated from it by the two-centimetre gap in the previous drawing.
  ang=side*math.pi/2;c=cube('',(math.sin(ang)*.315,-math.cos(ang)*.315,5.104),(.0766,.1516,.5716));c.rotation_euler.z=ang;boolop(hub,c)
 addpart(hub,'HUB','hub','ROOF_SUPPORT','四向攒尖座：由中央短柱承托')
 # Four genuine inclined roof panels; thickness, bearings and load vertices
 # follow the same plane as their supporting rafter upper faces.
 for side,name in enumerate(['FRONT','RIGHT','BACK','LEFT']):
  xy0=[(-2.30,-2.30),(2.30,-2.30),(.34,-.34),(-.34,-.34)]
  ang=side*math.pi/2
  xyv=[(x*math.cos(ang)-y*math.sin(ang),x*math.sin(ang)+y*math.cos(ang)) for x,y in xy0]
  # side ordering follows the actual rotation: front,right,back,left.
  deck=slope_panel('',xyv,lambda x,y:roof(x,y)+.032,.03)
  addpart(deck,'DECK_'+name,'panel','ROOF_PANELS','坡望板：落在真实椽面')
  tile=slope_panel('',xyv,lambda x,y:roof(x,y)+.052,.018)
  # Actual shallow ceramic roll ribs, fused into the removable roof-skin
  # proxy. They follow the exact deck plane and keep the old grey-tile look.
  for k in range(25):
   u=-2.16+k*.18;inner=max(abs(u)+.065,.35)
   if inner>2.27:continue
   vs=[];segments=8
   for t in [inner,2.30]:
    for j in range(segments+1):
     th=j*math.pi/segments;xx=u+math.cos(th)*.031;yy=-t
     x=xx*math.cos(ang)-yy*math.sin(ang);y=xx*math.sin(ang)+yy*math.cos(ang)
     vs.append((x,y,roof(x,y)+.049+math.sin(th)*.031))
   ns=segments+1;fs=[tuple(range(ns-1,-1,-1)),tuple(range(ns,ns*2))]+[(j,j+1,j+1+ns,j+ns) for j in range(segments)]+[(0,ns,ns*2-1,ns-1)]
   union(tile,mesh('',vs,fs))
  addpart(tile,'TILE_'+name,'tile','ROOF_SKIN','灰瓦屋面')
  PANELS.append({'id':'DECK_'+name,'vertices':[[x,y,roof(x,y)+.032] for x,y in xyv],'support_nodes':[]})
 # A fitted grey ceramic cap and small finial cover the supported central
 # block; its bottom is exactly the hub top, not a hovering apex ornament.
 cap=cube('',(0,0,5.205),(.66,.66,.07))
 crown=mesh('',[(-.33,-.33,5.239),(.33,-.33,5.239),(.33,.33,5.239),(-.33,.33,5.239),(0,0,5.57)],[(3,2,1,0),(0,1,4),(1,2,4),(2,3,4),(3,0,4)])
 union(cap,crown);addpart(cap,'FINIAL','tile','ROOF_SKIN','灰陶宝顶：实坐攒尖座')
 # Horizontal rail panels have real short tenons into column pockets. They
 # are inserted while the posts of each bent are apart, so no impossible
 # vertical railing insertion is shown. Front stays open as the entrance.
 for name,y in [('BACK',1.5)]:
  for k,z in enumerate([.92,1.38]):
   p=cube('',(0,y,z),(2.72,.08,.10))
   for s in [-1,1]:
    union(p,cube('',(s*1.399,y,z),(.082,.045,.060)))
    suffix=('B' if y>0 else 'F')+('L' if s<0 else 'R');boolop(PARTS['POST_'+suffix]['obj'],cube('',(s*1.40,y,z),(.0836,.0466,.0616)))
   addpart(p,f'RAIL_{name}_{k}','rail','BENT_'+name,'栏杆横枋：水平榫接','x')
  # Balusters are fitted between the two rails and are part of the bent.
  for i,x in enumerate([-.96,-.48,0,.48,.96]):
   b=cube('',(x,y,1.15),(.055,.055,.36));union(b,cube('',(x,y,.953),(.030,.030,.038)));union(b,cube('',(x,y,1.347),(.030,.030,.038)))
   for k,z in [(0,.950),(1,1.350)]:boolop(PARTS[f'RAIL_{name}_{k}']['obj'],cube('',(x,y,z),(.0316,.0316,.0436)))
   addpart(b,f'BALUSTER_{i:02d}','rail','BENT_BACK','栏杆短柱：随栏片成组')
 # Frame lines and explicit bearing offsets for the native solver.
 for suffix,x,y in [('FL',-1.5,-1.5),('FR',1.5,-1.5),('BL',-1.5,1.5),('BR',1.5,1.5)]:
  zs=[.4,2.1,2.42,3.0,3.42,3.63]
  for z0,z1 in zip(zs,zs[1:]):member('POST_'+suffix,(x,y,z0),(x,y,z1),.28,.28,'post')
  # The bracket pieces are modelled as short bearing members, one per real
  # block. Their centroid offsets are declared instead of hidden geometry.
  zlevels=[('DOU_',3.63,3.75),('GONG_X_',3.75,3.81),('GONG_Y_',3.81,3.87),('CAP_',3.87,4.07)]
  for prefix,z0,z1 in zlevels:member(prefix+suffix,(x,y,z0),(x,y,z1),.16,.16,'bracket')
 for name,y in [('FRONT',-1.5),('BACK',1.5)]:
  xs=[-1.5,-.78,0,.78,1.5]
  for a,b in zip(xs,xs[1:]):member('CROSS_'+name,(a,y,3),(b,y,3),.22,.30,'beam')
 for side,x in [('LEFT',-1.5),('RIGHT',1.5)]:
  ys=[-1.5,-.78,0,.78,1.5]
  for a,b in zip(ys,ys[1:]):member('LONG_'+side,(x,a,3.42),(x,b,3.42),.14,.24,'beam')
 for ax,name,fixed in [('x','FRONT',-1.5),('x','BACK',1.5),('y','LEFT',-1.5),('y','RIGHT',1.5)]:
  cuts=sorted(set([-1.5,0,1.5]+[-1.32+2.64*i/(count-1) for i in range(count)]))
  for a,b in zip(cuts,cuts[1:]):member('PURLIN_'+ax.upper()+'_'+name,(a,fixed,4.07) if ax=='x' else (fixed,a,4.07),(b,fixed,4.07) if ax=='x' else (fixed,b,4.07),.18,.14,'purlin')
 for ax in ['X','Y']:
  for a,b in [(-1.5,0),(0,1.5)]:member('SUPPORT_'+ax,(a,0,4.07) if ax=='X' else (0,a,4.07),(b,0,4.07) if ax=='X' else (0,b,4.07),.16,.14,'beam')
 member('CENTRE_POST',(0,0,4.07),(0,0,4.77),.16,.16,'post');member('HUB',(0,0,4.77),(0,0,4.97),.32,.32,'hub')
 for suffix,sx,sy in [('FL',-1,-1),('FR',1,-1),('BL',-1,1),('BR',1,1)]:
  ds=sorted(set([.41/math.sqrt(2),1.5,2.30]+[abs(-1.32+2.64*i/(count-1)) for i in range(count) if abs(-1.32+2.64*i/(count-1))>.36]))
  pts=[(sx*d,sy*d,roof(sx*d,sy*d)-.12) for d in ds]
  for a,b in zip(pts,pts[1:]):member('HIP_'+suffix,a,b,.18,.24,'hip')
  link((0,0,4.97),pts[0],'HUB');link((sx*1.5,sy*1.5,4.07),(sx*1.5,sy*1.5,4.14),'HIP_'+suffix)
 for p in PANELS:
  name=p['id'].removeprefix('DECK_');side=['FRONT','RIGHT','BACK','LEFT'].index(name)
  p['support_nodes']=sorted(set(n for m in MEMBERS if m['part_id'].startswith(f'RAF_{side}_') for n in m['nodes']))
 # Boolean cutters must never leave empty/default material slots in the
 # exported piece. Reset all face indices after the complete joinery pass.
 for p in PARTS.values():
  o=p['obj'];role=p['role'];o.data.materials.clear();o.data.materials.append(MATS['stone' if role=='stone' else 'tile' if role=='tile' else 'peg' if role=='peg' else 'wood'])
  for f in o.data.polygons:f.material_index=0

def bounds(obj):
 v=[obj.matrix_world@Vector(c) for c in obj.bound_box];return [min(p[i] for p in v) for i in range(3)],[max(p[i] for p in v) for i in range(3)]
def overlap_volume(a,b):
 amin,amax=bounds(a);bmin,bmax=bounds(b)
 if any(min(amax[i],bmax[i])-max(amin[i],bmin[i])<1e-6 for i in range(3)):return 0.
 tmp=copy_cutter(a)
 try:
  boolop(tmp,b,'INTERSECT',False);bm=bmesh.new();bm.from_mesh(tmp.data);volume=abs(bm.calc_volume(signed=True));bm.free();return volume
 finally:bpy.data.objects.remove(tmp,do_unlink=True)
def qa_geometry():
 checks=[];bad=[];watertight=[]
 for pid,p in PARTS.items():
  bm=bmesh.new();bm.from_mesh(p['obj'].data);non=sum(not e.is_manifold for e in bm.edges);volume=abs(bm.calc_volume(signed=True));bm.free()
  watertight.append({'part_id':pid,'nonmanifold_edges':non,'volume_m3':volume})
  if non or volume<1e-8:bad.append({'part_id':pid,'reason':'nonmanifold_or_empty','nonmanifold_edges':non,'volume':volume})
 keys=list(PARTS)
 for ai,b in itertools.combinations(keys,2):
  v=overlap_volume(PARTS[ai]['obj'],PARTS[b]['obj'])
  if v>2e-7:checks.append({'a':ai,'b':b,'intersection_volume_m3':v})
 result={'units':'m','tolerance_volume_m3':2e-7,'watertight':watertight,'mesh_errors':bad,'assembled_intersections':checks,'pass':not bad and not checks}
 savej(RESEARCH/'geometry-qa.json',result);return result

def qa_paths():
 results=[];rest={k:p['obj'].matrix_world.copy() for k,p in PARTS.items()}
 def check(name,movers,targets,offset,samples=13):
  worst=0.;events=[]
  for s in range(samples):
   f=1-s/(samples-1);v=Vector(offset)*f
   for pid in movers:
    m=rest[pid].copy();m.translation+=v;PARTS[pid]['obj'].matrix_world=m
   bpy.context.view_layer.update()
   for a in movers:
    for b in targets:
     if a==b:continue
     vol=overlap_volume(PARTS[a]['obj'],PARTS[b]['obj']);worst=max(worst,vol)
     if vol>2e-7:events.append({'sample':s,'moving':a,'fixed':b,'intersection_volume_m3':vol})
  for pid in movers:PARTS[pid]['obj'].matrix_world=rest[pid]
  bpy.context.view_layer.update();results.append({'path':name,'samples':samples,'max_volume_m3':worst,'errors':events,'pass':not events})
 for sf in ['FL','FR','BL','BR']:
  side='FRONT' if sf[0]=='F' else 'BACK';sx=-1 if sf[1]=='L' else 1
  targets=['CROSS_'+side,'BRACE_X_'+sf]
  if side=='BACK':targets+=['RAIL_BACK_0','RAIL_BACK_1']
  check('column_X_'+sf,['POST_'+sf],targets,(sx*.6,0,0))
  check('brace_X_up_'+sf,['BRACE_X_'+sf],['CROSS_'+side],(0,0,-.42))
  check('brace_Y_up_'+sf,['BRACE_Y_'+sf],['LONG_'+('LEFT' if sx<0 else 'RIGHT')],(0,0,-.42))
  check('peg_X_'+sf,['PEG_X_'+sf],['POST_'+sf,'CROSS_'+side],(0,-.45,0))
  check('peg_Y_'+sf,['PEG_Y_'+sf],['POST_'+sf,'LONG_'+('LEFT' if sx<0 else 'RIGHT')],(-.5,0,0))
 for side,sgn in [('FRONT',-1),('BACK',1)]:
  movers=[k for k,p in PARTS.items() if p['parent']=='BENT_'+side]
  targets=[k for k in PARTS if k.startswith(('LONG_','BRACE_Y_'))]
  check('close_bent_Y_'+side,movers,targets,(0,sgn*.85,0))
 for sf in ['FL','FR','BL','BR']:
  check('dou_down_'+sf,['DOU_'+sf],['POST_'+sf],(0,0,.5))
  check('cross_gong_down_'+sf,['GONG_Y_'+sf],['GONG_X_'+sf],(0,0,.5))
 for p in ['PURLIN_Y_LEFT','PURLIN_Y_RIGHT']:
  check('purlin_down_'+p,[p],['PURLIN_X_FRONT','PURLIN_X_BACK'],(0,0,.5))
 check('support_cross_down',['SUPPORT_Y'],['SUPPORT_X','PURLIN_X_FRONT','PURLIN_X_BACK'],(0,0,.5))
 check('centre_post_down',['CENTRE_POST'],['SUPPORT_Y'],(0,0,.5))
 check('hub_down',['HUB'],['CENTRE_POST'],(0,0,.5))
 for sf in ['FL','FR','BL','BR']:
  sx=-1 if sf[1]=='L' else 1;sy=-1 if sf[0]=='F' else 1
  check('hip_lower_into_open_seat_'+sf,['HIP_'+sf],['HUB']+[k for k in PARTS if k.startswith(('PURLIN_','CAP_'))],(0,0,.60))
 for k in PARTS:
  if k.startswith('RAF_'):
   check('rafter_drop_'+k,[k],['HUB']+[i for i in PARTS if i.startswith(('HIP_','PURLIN_','CAP_','SUPPORT_'))],(0,0,.5),7)
 report={'sampled_construction_paths':len(results),'checks':results,'pass':all(r['pass'] for r in results),'method':'Blender exact Boolean intersection volume at bounded sampling; prerequisite components only; closed bents move as groups; not a manufacturing certification'}
 savej(RESEARCH/'assembly-path-qa.json',report);return report

def manifest():
 def assembly_keys(pid,p):
  # Every offset is relative to the exported assembled mesh. A moving bent
  # carries its own columns, braces, pegs and railing through the later Y
  # closure; no double-ended beam is pulled through two fixed columns.
  parent=p['parent'];front=parent=='BENT_FRONT';back=parent=='BENT_BACK';sy=-1 if front else 1
  bent=Vector((0,sy*.85,0)) if front or back else Vector((0,0,0))
  local=[]
  if pid.startswith('STONE_') or pid=='PLINTH':local=[(0,(0,0,0)),(1,(0,0,0))]
  elif pid.startswith('POST_'):
   sx=-1 if pid.endswith('L') else 1;local=[(0,(sx*.6,0,0)),(.12,(sx*.6,0,0)),(.21,(0,0,0))]
  elif pid.startswith('BRACE_'):local=[(0,(0,0,-.42)),(.035,(0,0,-.42)),(.10,(0,0,0))]
  elif pid.startswith('PEG_X_'):local=[(0,(0,-.45,0)),(.23,(0,-.45,0)),(.29,(0,0,0))]
  elif pid.startswith('PEG_Y_'):local=[(0,(-.5,0,0)),(.46,(-.5,0,0)),(.51,(0,0,0))]
  elif pid.startswith('RAIL_BACK_'):local=[(0,(0,0,0)),(1,(0,0,0))]
  elif pid.startswith('DOU_'):local=[(0,(0,0,1.4)),(.52,(0,0,1.4)),(.56,(0,0,0))]
  elif pid.startswith('GONG_X_'):local=[(0,(0,0,1.7)),(.57,(0,0,1.7)),(.60,(0,0,0))]
  elif pid.startswith('GONG_Y_'):local=[(0,(0,0,1.9)),(.605,(0,0,1.9)),(.63,(0,0,0))]
  elif pid.startswith('CAP_'):local=[(0,(0,0,2.1)),(.635,(0,0,2.1)),(.66,(0,0,0))]
  elif pid.startswith('PURLIN_X_'):local=[(0,(0,0,2.4)),(.665,(0,0,2.4)),(.70,(0,0,0))]
  elif pid.startswith('PURLIN_Y_'):local=[(0,(0,0,2.6)),(.705,(0,0,2.6)),(.74,(0,0,0))]
  elif pid=='SUPPORT_X':local=[(0,(0,0,2.8)),(.745,(0,0,2.8)),(.77,(0,0,0))]
  elif pid=='SUPPORT_Y':local=[(0,(0,0,3.0)),(.775,(0,0,3.0)),(.80,(0,0,0))]
  elif pid=='CENTRE_POST':local=[(0,(0,0,3.1)),(.805,(0,0,3.1)),(.83,(0,0,0))]
  elif pid=='HUB':local=[(0,(0,0,3.1)),(.835,(0,0,3.1)),(.855,(0,0,0))]
  elif pid.startswith('HIP_'):
   sx=-1 if pid.endswith('L') else 1;sy=-1 if pid.startswith('HIP_F') else 1
   # Keep the four waiting hips outside the roof footprint. Lower them
   # outside first, then align above the seats, finally descend vertically.
   local=[(0,(sx*2.6,sy*2.6,2.7)),(.835,(sx*2.6,sy*2.6,2.7)),(.855,(sx*2.6,sy*2.6,.60)),(.875,(0,0,.60)),(.893,(0,0,0))]
  elif pid.startswith('RAF_'):
   i=int(pid.split('_')[2]);a=.897+i*.0015;local=[(0,(0,0,3.5)),(a,(0,0,3.5)),(a+.031,(0,0,0))]
  elif pid.startswith('DECK_'):local=[(0,(0,0,3.95)),(.952,(0,0,3.95)),(.979,(0,0,0))]
  elif pid.startswith('TILE_') or pid=='FINIAL':local=[(0,(0,0,4.2)),(.98,(0,0,4.2)),(1,(0,0,0))]
  else:local=[(0,(0,0,0)),(1,(0,0,0))]
  # Union the local event times with the bent closure event times so linear
  # or smooth interpolation is stateless and reversible for every part.
  times=sorted(set([t for t,v in local]+([.32,.45,1] if front or back else [1])))
  def interp(t):
   if t<=local[0][0]:return Vector(local[0][1])
   for (a,av),(b,bv) in zip(local,local[1:]):
    if t<=b:return Vector(av).lerp(Vector(bv),(t-a)/(b-a))
   return Vector(local[-1][1])
  out=[]
  for t in times:
   f=1 if t<=.32 else 0 if t>=.45 else 1-(t-.32)/.13
   off=interp(t)+bent*f;out.append({'t':t,'offset_blender':list(off),'offset_three':three(off)})
  return out
 # Transform matrices are column-major, ready for THREE.Matrix4.fromArray.
 rows=[]
 for pid,p in PARTS.items():
  o=p['obj'];bpy.context.view_layer.update();m=o.matrix_world.copy();p['assembled_matrix']=m.copy();mt=C@m@C.inverted();lo,hi=bounds(o)
  vs=[three(m@Vector(v)) for v in o.bound_box];bb=[[min(v[i] for v in vs) for i in range(3)],[max(v[i] for v in vs) for i in range(3)]]
  rows.append({'id':pid,'mesh_name':pid,'parent':p['parent'],'role':p['role'],'label_zh':p['label_zh'],'rest_matrix_blender':[m[r][c] for c in range(4) for r in range(4)],'rest_matrix_three':[mt[r][c] for c in range(4) for r in range(4)],'bbox_blender':[lo,hi],'bbox_three':bb,'assembly_keys':assembly_keys(pid,p)})
 stages=[{'order':0,'id':'FOUNDATION','parts':[k for k in PARTS if k.startswith('STONE_')],'offset_blender':[0,0,0],'method':'fixed supports'},
  {'order':1,'id':'BENT_FRONT','parts':[k for k,p in PARTS.items() if p['parent']=='BENT_FRONT'],'offset_blender':[0,-.85,0],'method':'assemble cross beam and braces first; columns slide along X'},
  {'order':2,'id':'BENT_BACK','parts':[k for k,p in PARTS.items() if p['parent']=='BENT_BACK'],'offset_blender':[0,.85,0],'method':'assemble cross beam, railing and braces first; columns slide along X'},
  {'order':3,'id':'FRAME_CLOSE','parts':[k for k in PARTS if k.startswith(('LONG_','BRACE_Y_'))],'offset_blender':[0,0,0],'method':'move the two completed bents inward along Y over the stationary longitudinal tenons'},
  {'order':4,'id':'LOCK_PEGS','parts':[k for k in PARTS if k.startswith('PEG_Y_')],'offset_blender':[.50,0,0],'method':'insert across aligned post-and-tenon holes'},
  {'order':5,'id':'BRACKETS','parts':[k for k,p in PARTS.items() if p['parent']=='BRACKETS'],'offset_blender':[0,0,.6],'method':'lower housed block, crossed arms, then cap; each has a solid bearing'},
  {'order':6,'id':'PURLINS','parts':[k for k in PARTS if k.startswith('PURLIN_')],'offset_blender':[0,0,.7],'method':'X lower-half corner first, then Y upper-half'},
  {'order':7,'id':'ROOF_SUPPORT','parts':['SUPPORT_X','SUPPORT_Y','CENTRE_POST','HUB'],'offset_blender':[0,0,.8],'method':'cross supports -> short post -> supported hub'},
  {'order':8,'id':'HIP_FRAME','parts':[k for k in PARTS if k.startswith('HIP_')],'method':'align above the frame, lower into four upward-open hub pockets and eave seats; final cap retains the upper ends','per_part_offsets_blender':{k:[0,0,.60] for k in PARTS if k.startswith('HIP_')}},
  {'order':9,'id':'RAFTERS','parts':[k for k in PARTS if k.startswith('RAF_')],'offset_blender':[0,0,.65],'method':'vertical lowering into hip housings and purlin birdsmouths'},
  {'order':10,'id':'ROOF_PANELS','parts':[k for k in PARTS if k.startswith(('DECK_','TILE_'))],'offset_blender':[0,0,.85],'method':'inclined boards stay parallel to their rafter bearing plane'}]
 for st in stages:
  if 'offset_blender' in st:st['offset_three']=three(st['offset_blender'])
  if 'per_part_offsets_blender' in st:st['per_part_offsets_three']={k:three(v) for k,v in st['per_part_offsets_blender'].items()}
  st['reverse_requires']=[s['id'] for s in stages if s['order']>st['order']]
 demos={'straight':{'focus_three':three((-1.5,-1.5,3.0)),'anchor_part':'POST_FL','assembly_window':[.12,.29]},'frame':{'focus_three':three((-1.5,-1.5,3.42)),'anchor_part':'POST_FL','assembly_window':[.30,.51]},'bracket':{'focus_three':three((-1.5,-1.5,3.81)),'anchor_part':'DOU_FL','assembly_window':[.52,.66]},'hip':{'focus_three':three((0,0,4.97)),'anchor_part':'HUB','assembly_window':[.805,.941]}}
 m={'schema':'rainbow.pavilion.v7/1','coordinate_system':'Blender Z-up; Three [x,z,-y]','units':'m','rest_pose':'assembled','glb_contains_animation':False,'title':'原攒尖亭的可装配结构加固','parts':rows,'joints':JOINTS,'assembly':stages,'demonstrations':demos,'notes':['教育性木作方案，非某古迹的测绘复原','立柱固定是基底锚固的分析假设','先拔销，再按子装配逆序拆解；不允许双端榫梁从两个固定柱间横向穿出']}
 savej(PUBLIC/'pavilion-manifest.json',m);savej(RESEARCH/'pavilion-manifest.json',m)
 # Eliminate duplicate links and declare any dependent constraints, leaving
 # an auditable centreline/offset contract for the independent native solver.
 unique={};duplicate=[]
 for l in LINKS:
  if l['slave'] not in unique:unique[l['slave']]=l
  elif unique[l['slave']]['master']!=l['master']:duplicate.append(l)
 contract={'units':'m','coordinate_system':'Blender Z-up','nodes':NODES,'members':MEMBERS,'rigid_links':list(unique.values()),'duplicate_slave_links_not_applied':duplicate,'roof_panels':PANELS,'part_mesh_map':{k:[k] for k in PARTS},'geometry_manifest':'pavilion-manifest.json','boundary_note':'four post bases assumed anchored, fixed six DOFs; timber joints are rigid in the baseline (stiffness upper bound); check semi-rigid sensitivity','material_note':'illustrative homogeneous timber E=9GPa G=.56GPa rho=460kg/m3'}
 savej(RESEARCH/'frame-contract.json',contract)
 return m

def export():
 bpy.ops.object.select_all(action='DESELECT')
 for o in ROOTS.values():o.select_set(True)
 for p in PARTS.values():p['obj'].select_set(True)
 bpy.context.view_layer.objects.active=next(iter(ROOTS.values()))
 bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'pavilion-v7.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False)

def bake_wood_texture():
 # glTF cannot export Blender Noise/ColorRamp nodes. Create an actual image
 # and explicit per-face wood-grain UVs so the exported asset remains wood.
 width,height=1024,512;x=np.linspace(0,1,width)[None,:];y=np.linspace(0,1,height)[:,None]
 rng=np.random.default_rng(734);grain=np.sin((y*54+.18*np.sin(x*11)+.07*np.sin(x*37))*2*np.pi)
 fibers=np.sin((y*153+.32*np.sin(x*7))*2*np.pi);fine=rng.normal(0,.01,(height,width))
 value=.94+.055*grain+.022*fibers+fine
 rgba=np.ones((height,width,4),np.float32)
 for i,c in enumerate([.62,.385,.19]):rgba[:,:,i]=np.clip(value*c,0,1)
 image=bpy.data.images.get('cedar_grain_baked') or bpy.data.images.new('cedar_grain_baked',width=width,height=height,alpha=True)
 image.pixels.foreach_set(rgba.ravel());image.filepath_raw=str(PUBLIC/'cedar-grain.png');image.file_format='PNG';image.save();image.pack()
 for name in ['wood warm cedar','wood peg']:
  ma=bpy.data.materials.get(name)
  if not ma:continue
  p=ma.node_tree.nodes.get('Principled BSDF')
  for old in list(p.inputs['Base Color'].links):ma.node_tree.links.remove(old)
  tex=ma.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT';ma.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
 for p in PARTS.values():
  if p['role'] in ['stone','tile']:continue
  o=p['obj'];me=o.data;uv=me.uv_layers.get('TimberGrain') or me.uv_layers.new(name='TimberGrain');me.uv_layers.active=uv
  co=np.array([tuple(v.co) for v in me.vertices]);cov=np.cov(co.T);_,vectors=np.linalg.eigh(cov);fiber=Vector(vectors[:,-1]);fallback=Vector(vectors[:,-2])
  for poly in me.polygons:
   cross=poly.normal.cross(fiber)
   if cross.length<1e-5:cross=fallback.copy()
   else:cross.normalize()
   for li in poly.loop_indices:
    v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v.dot(fiber)*.72,v.dot(cross)*3.2)
  o['material_texture']='cedar-grain.png';o['prefer_embedded_material']=True

def render_views():
 sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.render.resolution_x=1600;sc.render.resolution_y=1200;sc.render.resolution_percentage=100
 sc.world=bpy.data.worlds.new('warm paper');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.81,.79,.73,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.6
 sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast'
 for loc,power,size in [((5,-7,12),1500,7),((-7,-3,6),800,6),((2,7,10),1100,5)]:
  d=bpy.data.lights.new('softbox','AREA');d.energy=power;d.size=size;o=bpy.data.objects.new('softbox',d);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,2.5))-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Audit camera');cam=bpy.data.objects.new('Audit camera',d);sc.collection.objects.link(cam);cam.location=(8,-10,8);cam.rotation_euler=(Vector((0,0,2.6))-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=8.2;sc.camera=cam
 sc.render.filepath=str(OUT/'assembled.png');bpy.ops.render.render(write_still=True)
 for pid,p in PARTS.items():
  o=p['obj'];offset=Vector((0,0,0))
  if pid=='FINIAL':offset=Vector((0,0,2.3))
  elif pid.startswith(('DECK_','TILE_')):
   angle=['FRONT','RIGHT','BACK','LEFT'].index(pid.split('_')[1])*math.pi/2;offset=Vector((math.sin(angle)*.85,-math.cos(angle)*.85,1.6 if pid.startswith('DECK_') else 2.2))
  elif pid.startswith('RAF_'):offset=Vector((0,0,1.1))
  elif pid.startswith('HIP_'):offset=Vector((math.copysign(.35,o.location.x),math.copysign(.35,o.location.y),.75))
  elif p['parent']=='ROOF_SUPPORT':offset=Vector((0,0,.55))
  elif p['parent']=='BRACKETS':offset=Vector((0,0,.30))
  elif p['parent']=='PURLINS':offset=Vector((0,0,.45))
  elif p['parent']=='BENT_FRONT':offset=Vector((0,-.85,0))
  elif p['parent']=='BENT_BACK':offset=Vector((0,.85,0))
  o.location+=offset
 bpy.context.view_layer.update();cam.location=(9,-12,10);cam.rotation_euler=(Vector((0,0,3.6))-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=10.8
 sc.render.filepath=str(OUT/'exploded.png');bpy.ops.render.render(write_still=True)
 for p in PARTS.values():p['obj'].matrix_world=p['assembled_matrix']
 bpy.context.view_layer.update();cam.location=(8,-10,8);cam.rotation_euler=(Vector((0,0,2.6))-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=8.2
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pavilion-v7.blend'))

if __name__=='__main__':
 bpy.ops.wm.read_factory_settings(use_empty=True);MATS={'wood':mat('wood warm cedar',(.44,.225,.092)), 'stone':mat('granite',(.51,.51,.47)), 'tile':mat('ink-grey ceramic',(.095,.14,.145),.32), 'peg':mat('wood peg',(.58,.31,.115))}
 build();bpy.context.view_layer.update();bake_wood_texture();manifest();export()
 print('V7_GEOMETRY_AND_CONTRACT_READY',flush=True)
 qa=qa_geometry();print('V7_QA',json.dumps({k:v for k,v in qa.items() if k!='watertight'}),flush=True)
 pathqa=qa_paths();print('V7_PATH_QA',pathqa['pass'],pathqa['sampled_construction_paths'],flush=True)
 render_views();print('V7_FINISHED',flush=True)
