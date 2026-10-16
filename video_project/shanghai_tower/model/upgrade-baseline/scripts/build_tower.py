"""Shanghai Tower: sourced educational decomposition, not a construction BIM.

Run D:/blender/blender.exe --background --factory-startup --python scripts/build_tower.py
Blender uses metres/Z-up; exported GLB uses metres/Y-up and assembled rest pose.
All semantic part origins are world zero. Reconstruction choices are disclosed
in the generated manifest; source-linked global dimensions are updated from
research/model-source-parameters.json when present.
"""
import bpy, math, json, sys
from mathutils import Vector
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models'; MODEL=ROOT/'model'; RESEARCH=ROOT/'research'
for d in (OUT,MODEL,RESEARCH): d.mkdir(parents=True,exist_ok=True)
TAU=math.tau
PARAM={
 'height':632.0,'facade_top':632.0,'occupied_top':583.0,
 'twist_degrees':120.0,'base_outer_radius':49.0,'top_area_ratio':0.45,
 'inner_radius_base':38.0,'inner_radius_top':22.6,
 'core_width_base':30.0,'core_width_top':18.0,'core_wall_base':2.0,'core_wall_top':1.0,
 'zone_boundaries':[0,64,128,195,264,333,402,471,540,583],
 'floors':128,'pile_count':947,'pile_length':52.0,'pile_radius':0.5,'raft_thickness':6.0,
 'excavation_depth':33.0,'diaphragm_inner_diameter':121.0,
 'damper_height':578.0,'damper_mass_tonnes':1000.0,
 'source_status':'Sourced global facts plus explicitly approximate visible dimensions; see model assumptions.'}
sourcefile=RESEARCH/'model-source-parameters.json'
if sourcefile.exists(): PARAM.update(json.loads(sourcefile.read_text(encoding='utf8')).get('parameters',{}))
H=PARAM['height']; OCC=PARAM['occupied_top']; ZONES=PARAM['zone_boundaries']
PARTS=[]; GROUPS={}; SOURCES={}

def three(v): return [round(float(v[0]),5),round(float(v[2]),5),round(float(-v[1]),5)]
def jwrite(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def material(name,color,rough=.4,metallic=0,alpha=1):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,alpha);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,alpha)
 p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metallic;p.inputs['Alpha'].default_value=alpha
 if alpha<1:
  m.surface_render_method='DITHERED';m.use_transparency_overlap=False
 return m

class Builder:
 def __init__(self):self.v=[];self.f=[]
 def quad(self,vs):
  k=len(self.v);self.v.extend(vs);self.f.append(tuple(range(k,k+len(vs))))
 def box(self,c,size):
  x,y,z=c;a,b,h=[q/2 for q in size];k=len(self.v)
  self.v.extend([(x+sx*a,y+sy*b,z+sz*h) for sz in (-1,1) for sy in (-1,1) for sx in (-1,1)])
  self.f.extend(tuple(k+i for i in q) for q in [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)])
 def beam(self,a,b,width,depth=None):
  a=Vector(a);b=Vector(b);d=(b-a).normalized();q=Vector((0,0,1))
  if abs(d.dot(q))>.98:q=Vector((1,0,0))
  u=d.cross(q).normalized()*width/2;v=d.cross(u).normalized()*(depth or width)/2;k=len(self.v)
  self.v.extend([tuple(p+su*u+sv*v) for p in (a,b) for su,sv in [(-1,-1),(1,-1),(1,1),(-1,1)]])
  self.f.extend(tuple(k+i for i in q) for q in [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
 def cylinder(self,c,r,h,n=24):
  x,y,z=c;k=len(self.v)
  self.v.extend([(x+r*math.cos(i*TAU/n),y+r*math.sin(i*TAU/n),z+s*h/2) for s in (-1,1) for i in range(n)])
  self.f.extend([(k+i,k+(i+1)%n,k+n+(i+1)%n,k+n+i) for i in range(n)])
  self.f.extend([tuple(k+i for i in range(n-1,-1,-1)),tuple(k+n+i for i in range(n))])
 def ellipsoid(self,c,r,n=10,rings=5):
  k=len(self.v)
  for j in range(rings+1):
   p=math.pi*j/rings
   for i in range(n):
    t=TAU*i/n;self.v.append((c[0]+r[0]*math.sin(p)*math.cos(t),c[1]+r[1]*math.sin(p)*math.sin(t),c[2]+r[2]*math.cos(p)))
  for j in range(rings):
   for i in range(n):self.f.append((k+j*n+i,k+j*n+(i+1)%n,k+(j+1)*n+(i+1)%n,k+(j+1)*n+i))
 def ring(self,rin,rout,z,thick,start=0,end=TAU,n=64):
  for i in range(n):
   a=start+(end-start)*i/n;b=start+(end-start)*(i+1)/n
   def rr(r,t): return r(t) if callable(r) else r
   corners=[]
   for dz in (-thick/2,thick/2):
    corners.extend([(rr(r,t)*math.cos(t),rr(r,t)*math.sin(t),z+dz) for r,t in [(rin,a),(rout,a),(rout,b),(rin,b)]])
   k=len(self.v);self.v.extend(corners)
   self.f.extend(tuple(k+j for j in q) for q in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
 def mesh(self,name,mat,parent,role,label,explode=(0,0,0),notes=''):
  if not self.v:return None
  mesh=bpy.data.meshes.new(name+'_mesh');mesh.from_pydata(self.v,[],self.f);mesh.update()
  ob=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(ob);ob.data.materials.append(mat)
  ob.parent=group(parent);ob['role']=role;ob['label_zh']=label;ob['educational_reconstruction']=True
  ob['axis']='metres, Blender Z-up; GLB Y-up';ob['rest_pose']='assembled'
  vs=[Vector(v) for v in self.v];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
  center=[(a+b)/2 for a,b in zip(lo,hi)]
  pts=[three(v) for v in self.v];lot=[min(p[i] for p in pts) for i in range(3)];hit=[max(p[i] for p in pts) for i in range(3)]
  PARTS.append({'id':name,'mesh_name':name,'parent':parent,'role':role,'label_zh':label,
   'groupCenterThree':three(center),'bboxThree':[lot,hit],'explodeVectorThree':three(explode),
   'restPositionThree':[0,0,0],'notes':notes,'vertices':len(self.v),'polygons':len(self.f)})
  return ob

def group(name,parent='SHANGHAI_TOWER'):
 if name in GROUPS:return GROUPS[name]
 ob=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(ob);GROUPS[name]=ob
 if name!='SHANGHAI_TOWER':ob.parent=group(parent)
 return ob
def lerp(a,b,t):return a+(b-a)*t
def radius(z):return PARAM['base_outer_radius']*math.sqrt(lerp(1,PARAM['top_area_ratio'],min(z/H,1)))
def twist(z):return math.radians(PARAM['twist_degrees'])*z/H
def outer(z,t):
 # The built facade uses a rounded triangular plan. This smooth harmonic
 # approximation is disclosed; it is not a re-created fabrication curve.
 r=radius(z)*(1+.145*math.cos(3*t));a=t+twist(z)
 return (r*math.cos(a),r*math.sin(a),z)
def crown_edge(t):
 # Open, uneven crown outline traced qualitatively from the architect's
 # public section. 632 m is exact; the intermediate rim profile is schematic.
 return 615.5+16.5*math.cos(t-.7)
def shellpoint(z,t):
 if z<=OCC:return outer(z,t)
 return outer(OCC+(z-OCC)/(H-OCC)*(crown_edge(t)-OCC),t)
def inner(z):return lerp(PARAM['inner_radius_base'],PARAM['inner_radius_top'],min(z/OCC,1))
def corehalf(z):return .5*lerp(PARAM['core_width_base'],PARAM['core_width_top'],min(z/OCC,1))
def colxy(z,i):
 # Eight columns paired about the four perimeter quadrants; the main
 # structure does not follow the rotating outer curtain wall.
 a=math.radians(45+(i//2)*90+(-10 if i%2==0 else 10));r=inner(z)-2.2
 return r*math.cos(a),r*math.sin(a)
def core_radius(z,t,expand=0):return (corehalf(z)+expand)/max(abs(math.cos(t)),abs(math.sin(t)))

def build():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 group('SHANGHAI_TOWER')
 m={
 'concrete':material('Concrete | warm ivory',(.68,.70,.69),.62),
 'floors':material('Floor plate | architectural silver',(.71,.76,.76),.45,.08),
 'steel':material('Megaframe | brushed pale bronze',(.42,.35,.25),.31,.52),
 'truss':material('Outrigger | satin champagne',(.70,.51,.28),.33,.55),
 'glass':material('Outer glass | blue green',(.34,.65,.70),.22,.32,.32),
 'innerglass':material('Inner glass | warm clear',(.55,.75,.76),.25,.2,.22),
 'mullion':material('Mullions | platinum',(.60,.73,.74),.25,.7),
 'innerframe':material('Inner facade horizontal frame',(.39,.55,.57),.35,.42),
 'garden':material('Sky garden | muted green',(.26,.46,.32),.73),
 'leaves':material('Sky garden | living foliage',(.18,.36,.26),.8),
 'trunks':material('Sky garden | tree bark',(.30,.24,.18),.83),
 'soil':material('Excavation | earth',(.53,.42,.32),.92),
 'damper':material('Damper | copper',(.66,.32,.13),.27,.7),
 'cable':material('Cable | dark steel',(.20,.28,.30),.30,.8),
 'platform':material('Ground | warm white stone',(.81,.82,.78),.68)
 }
 # Foundation remains below the real ground datum. All piles are visibly
 # attached to the raft, never hovering beneath a decorative base.
 raft_top=-PARAM['excavation_depth']+PARAM['raft_thickness'];raft_bottom=-PARAM['excavation_depth']
 b=Builder();b.cylinder((0,0,raft_top-PARAM['raft_thickness']/2),60,PARAM['raft_thickness'],96)
 b.mesh('RAFT',m['concrete'],'FOUNDATION','raft','桩筏基础',(0,0,-10),notes='Circular outline is a teaching simplification; raft thickness source-linked.')
 coords=sorted([(x*3.12,y*3.12) for x in range(-20,21) for y in range(-20,21)],key=lambda p:p[0]**2+p[1]**2)[:PARAM['pile_count']]
 for sect in range(4):
  b=Builder()
  for i,(x,y) in enumerate(coords):
   if i%4==sect:b.cylinder((x,y,raft_bottom-PARAM['pile_length']/2),PARAM['pile_radius'],PARAM['pile_length'],10)
  b.mesh(f'PILES_Q{sect+1}',m['concrete'],'FOUNDATION','piles','灌注桩群',(0,0,-18),notes='Pile positions approximated on evenly spaced plan; pile count and lengths source-linked.')
 b=Builder();b.ring(62,84,-.8,1.6,n=96)
 b.mesh('GROUND_PLAZA',m['platform'],'GROUND','plaza','地面广场',(0,0,-4))
 b=Builder();b.ring(60.5,61.7,raft_bottom/2,-raft_bottom,start=0,end=math.pi,n=48)
 b.mesh('DIAPHRAGM_WALL_CUTAWAY',m['concrete'],'FOUNDATION','diaphragm_wall','地下连续墙剖面',(0,0,-5),notes='Front half removed for educational cutaway; documented inner diameter 121 m.')
 b=Builder();b.box((0,66,-16.5),(132,4,33));b.box((-66,0,-16.5),(4,132,33))
 b.mesh('SOIL_CUTAWAY',m['soil'],'GROUND','soil','地下剖面',(0,0,-5))
 b=Builder()
 for i in range(1,6):b.ring(lambda t:core_radius(0,t)+.05,58,raft_top*(1-i/5),.5,start=0,end=math.pi,n=48)
 for side in range(4):
  w=PARAM['core_width_base'];t=PARAM['core_wall_base'];a=side*math.pi/2
  if side%2==0:b.box(((w/2-t/2)*math.cos(a),0,raft_top/2),(t,w,-raft_top))
  else:b.box((0,(w/2-t/2)*math.sin(a),raft_top/2),(w,t,-raft_top))
 for ci in range(8):
  x,y=colxy(0,ci);b.beam((x,y,raft_top),(x,y,0),4,3.4)
 b.mesh('BASEMENT_CORE_FLOORS',m['concrete'],'FOUNDATION','basement','地下室与承重结构',(0,0,-8),notes='Five basement decks, half-floor cutaway; intermediate elevations approximate.')
 levels=[OCC*i/PARAM['floors'] for i in range(1,PARAM['floors']+1)]
 for zi,(z0,z1) in enumerate(zip(ZONES,ZONES[1:]),1):
  zid=f'Z{zi:02d}';zone=group(zid);mid=(z0+z1)/2
  group('CORE_'+zid,zid);group('FLOORS_'+zid,zid);group('MEGACOLUMNS_'+zid,zid);group('OUTRIGGERS_'+zid,zid);group('INNER_FACADE_'+zid,zid)
  # Four hollow core walls, with lift/service void remaining open at every floor.
  b=Builder();w0=2*corehalf(z0);w1=2*corehalf(z1);th=lerp(PARAM['core_wall_base'],PARAM['core_wall_top'],mid/OCC)
  # Separate front panel permits close-up selective transparency without
  # hiding the core behind an opaque rectangular solid.
  for side in range(4):
   b=Builder();a=side*math.pi/2;normal=Vector((math.cos(a),math.sin(a),0));along=Vector((-math.sin(a),math.cos(a),0))
   k=[]
   for z,w in [(z0,w0),(z1,w1)]:
    for n,s in [(w/2-th,-w/2),(w/2-th,w/2),(w/2,w/2),(w/2,-w/2)]:k.append(tuple(normal*n+along*s+Vector((0,0,z))))
   b.v=k;b.f=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
   b.mesh(f'CORE_{zid}_W{side+1}',m['concrete'],'CORE_'+zid,'core','钢筋混凝土核心筒',tuple(normal*10+Vector((0,0,zi*3))))
  for half in range(2):
   b=Builder()
   for z in levels:
    if z0<z<=z1:b.ring(lambda t:core_radius(z,t)+.05,inner(z)-.15,z,.34,start=half*math.pi,end=(half+1)*math.pi,n=40)
   b.mesh(f'FLOORS_{zid}_{"BACK" if half==0 else "FRONT"}',m['floors'],'FLOORS_'+zid,'floors','办公与居住楼板',(0,(-1 if half else 1)*18,zi*5),notes='Uniform intermediate floor spacing is a visual reconstruction; zone elevations are source-linked where available.')
  b=Builder()
  for z in levels:
   if z0<z<=z1:
    for i in range(16):
     t=TAU*i/16;ri=core_radius(z,t);ro=inner(z)-.4
     b.beam((ri*math.cos(t),ri*math.sin(t),z-.37),(ro*math.cos(t),ro*math.sin(t),z-.37),.24,.46)
  b.mesh('FLOOR_BEAMS_'+zid,m['steel'],'FLOORS_'+zid,'floorbeams','径向楼面钢梁',(0,0,zi*5),notes='Representative radial framing, not an exact fabrication schedule.')
  # Each mega-column segment can move independently, tied to one zone.
  for ci in range(8):
   b=Builder();a=(*colxy(z0,ci),z0);c=(*colxy(z1,ci),z1);width=lerp(3.9,1.65,mid/OCC)
   b.beam(a,c,width,width*.84);normal=Vector((a[0],a[1],0)).normalized()
   b.mesh(f'MEGACOL_{zid}_C{ci+1:02d}',m['steel'],'MEGACOLUMNS_'+zid,'megacolumn','组合巨柱',tuple(normal*(16+zi*.4)+Vector((0,0,zi*3))),notes='Member dimensions schematized; column taper and pairing communicate the documented megaframe.')
  # Two-storey mechanical belt/outrigger decks at the zone boundary.
  if zi<9:
   b=Builder();bottom=z1-8.6;top=z1;ringr=inner(z1)-2.2
   for ci in range(8):
    a=(*colxy(z1,ci),bottom);c=(*colxy(z1,(ci+1)%8),bottom);at=(a[0],a[1],top);ct=(c[0],c[1],top)
    b.beam(a,c,.6);b.beam(at,ct,.6);b.beam(a,ct,.48);b.beam(at,c,.48)
    cn=Vector((a[0],a[1],0)).normalized();base=core_radius(z1,math.atan2(a[1],a[0]))
    coreb=(cn.x*base,cn.y*base,bottom);coret=(cn.x*base,cn.y*base,top)
    b.beam(coreb,a,.66);b.beam(coret,at,.66);b.beam(coreb,at,.56);b.beam(coret,a,.56)
   b.mesh('OUTRIGGERS_'+zid+'_TRUSS',m['truss'],'OUTRIGGERS_'+zid,'outrigger','伸臂桁架与腰桁架',(0,0,zi*7),notes='Eight illustrated zone-interface belts; not fabrication-detail placement of every real outrigger.')
  # Inner facade: circular occupied cylinder, independent from rotating skin.
  for half in range(2):
   b=Builder();frame=Builder();start=half*math.pi
   for q in range(40):
    t=start+math.pi*q/40;u=start+math.pi*(q+1)/40
    b.quad([(inner(z0)*math.cos(t),inner(z0)*math.sin(t),z0),(inner(z0)*math.cos(u),inner(z0)*math.sin(u),z0),(inner(z1)*math.cos(u),inner(z1)*math.sin(u),z1),(inner(z1)*math.cos(t),inner(z1)*math.sin(t),z1)])
    if q%2==0:frame.beam((inner(z0)*math.cos(t),inner(z0)*math.sin(t),z0),(inner(z1)*math.cos(t),inner(z1)*math.sin(t),z1),.075)
   for z in levels:
    if z0<z<=z1:frame.ring(inner(z)-.035,inner(z)+.075,z,.09,start=start,end=start+math.pi,n=40)
   b.mesh(f'INNER_FACADE_{zid}_{half+1}_GLASS',m['innerglass'],'INNER_FACADE_'+zid,'innerfacade','内层幕墙',(0,(-1 if half else 1)*24,zi*5))
   frame.mesh(f'INNER_FACADE_{zid}_{half+1}_FRAME',m['innerframe'],'INNER_FACADE_'+zid,'innerframe','内幕墙分格',(0,(-1 if half else 1)*24,zi*5))
  # Triangular atrium base follows real external shell, circular opening.
  if zi>1:
   b=Builder();z=z0+.5
   for q in range(96):
    t=TAU*q/96;u=TAU*(q+1)/96;ta=t+twist(z);ua=u+twist(z)
    b.quad([(inner(z)*math.cos(ta),inner(z)*math.sin(ta),z),outer(z,t),outer(z,u),(inner(z)*math.cos(ua),inner(z)*math.sin(ua),z)])
   b.mesh('SKY_LOBBY_'+zid,m['floors'],zid,'sky_lobby','空中大堂与中庭',(0,0,zi*7))
   b=Builder()
   for n in range(18):
    t=TAU*n/18;xy=outer(z,t);p=Vector((xy[0],xy[1],z));r=Vector((p.x,p.y,0)).length
    p=Vector((p.x/r*(r-2.5),p.y/r*(r-2.5),z+.35));b.cylinder(p,1.1,.6,10)
   b.mesh('GARDEN_'+zid,m['garden'],zid,'garden','中庭绿植',(0,0,zi*7))
   leaves=Builder();trunks=Builder();rail=Builder();seats=Builder()
   for n in range(12):
    t=TAU*(n+.4)/12;xy=outer(z,t);r=math.hypot(xy[0],xy[1]);a=math.atan2(xy[1],xy[0]);rr=(r+inner(z))/2
    x,y=rr*math.cos(a),rr*math.sin(a)
    trunks.cylinder((x,y,z+1.4),.10,2.0,8)
    trunks.beam((x,y,z+1.8),(x+.55,y,z+2.7),.07)
    for k,(dx,dy,dz) in enumerate([(0,0,0),(.65,.2,-.25),(-.45,.4,-.15),(.1,-.55,.2)]):
     leaves.ellipsoid((x+dx,y+dy,z+2.7+dz),(1.0,.90,1.15),10,5)
    seats.box((x+1.8,y,z+.45),(1.6,.5,.7))
   for j in range(96):
    a=TAU*j/96;bangle=TAU*(j+1)/96;rr=inner(z)+.38
    rail.beam((rr*math.cos(a),rr*math.sin(a),z+1.1),(rr*math.cos(bangle),rr*math.sin(bangle),z+1.1),.055)
    if j%2==0:rail.beam((rr*math.cos(a),rr*math.sin(a),z),(rr*math.cos(a),rr*math.sin(a),z+1.1),.045)
   leaves.mesh('GARDEN_TREES_'+zid,m['leaves'],zid,'garden','中庭树冠',(0,0,zi*7),notes='Representative planted atrium landscape, not an exact planting schedule.')
   trunks.mesh('GARDEN_TRUNKS_'+zid,m['trunks'],zid,'garden','中庭树干',(0,0,zi*7))
   rail.mesh('GARDEN_RAILS_'+zid,m['innerframe'],zid,'garden','中庭栏杆',(0,0,zi*7))
   seats.mesh('GARDEN_SEATS_'+zid,m['truss'],zid,'garden','中庭休憩座椅',(0,0,zi*7))
 # Outer skin spans all 632 m, split into nine height zones plus crown and
 # six circumferential strips. Removing a strip reveals real interior parts.
 shell_zones=list(zip(ZONES,ZONES[1:]))+[(OCC,H)]
 for zi,(z0,z1) in enumerate(shell_zones,1):
  zid=f'Z{zi:02d}' if zi<=9 else 'CROWN'
  for sec in range(6):
   parent=f'ENVELOPE_{zid}_S{sec+1:02d}';group(parent,zid if zi<=9 else 'CROWN');b=Builder();f=Builder();ts=TAU*sec/6;te=TAU*(sec+1)/6
   nh=max(4,round((z1-z0)/4.55));nc=16
   for j in range(nh):
    za=lerp(z0,z1,j/nh);zb=lerp(z0,z1,(j+1)/nh)
    for i in range(nc):
     a=lerp(ts,te,i/nc);c=lerp(ts,te,(i+1)/nc)
     b.quad([shellpoint(za,a),shellpoint(za,c),shellpoint(zb,c),shellpoint(zb,a)])
     # Fine structural mullions: silver strips following the same skin.
     da=.048/radius((za+zb)/2)
     f.quad([shellpoint(za,a-da),shellpoint(za,a+da),shellpoint(zb,a+da),shellpoint(zb,a-da)])
     f.quad([shellpoint(za-.045,a),shellpoint(za-.045,c),shellpoint(za+.045,c),shellpoint(za+.045,a)])
   c=outer((z0+z1)/2,(ts+te)/2);n=Vector((c[0],c[1],0)).normalized();ex=tuple(n*(36+sec*3)+Vector((0,0,zi*3)))
   b.mesh(parent+'_GLASS',m['glass'],parent,'outerglass','旋转外层幕墙',ex,notes='Smooth rounded-triangle approximation, exact total twist and tower height.')
   f.mesh(parent+'_MULLIONS',m['mullion'],parent,'mullions','外幕墙竖梃与横梁',ex)
  # Three continuous sculptural edge ribs distinguish the tapered twist.
  b=Builder()
  for k in range(3):
   a=TAU*k/3
   for j in range(20):b.beam(shellpoint(lerp(z0,z1,j/20),a),shellpoint(lerp(z0,z1,(j+1)/20),a),.22)
  b.mesh('SPIRAL_RIBS_'+zid,m['mullion'],zid if zi<=9 else 'CROWN','spiralrib','外立面旋转棱线',(0,0,zi*3))
 # A visibly open structural crown rather than an opaque cone.
 b=Builder()
 for i in range(18):
  t=TAU*i/18;u=TAU*(i+1)/18
  b.beam(shellpoint(OCC,t),shellpoint(H,u),.52)
  for z in [OCC,603,620,632]:b.beam(shellpoint(z,t),shellpoint(z,u),.55)
 b.mesh('CROWN_FRAME',m['steel'],'CROWN','crown','塔冠钢结构',(0,0,58))
 # TMD schematic: suspended mass + cables + damping interface. Its visible
 # artwork casing is omitted; dimensions are explicitly illustrative.
 dh=PARAM['damper_height'];b=Builder();b.box((0,0,dh),(8.0,8.0,9.0));b.box((0,0,dh+4.65),(10.0,10.0,.3))
 b.mesh('TMD_MASS',m['damper'],'TMD','damper','千吨级调谐质量阻尼器',(0,0,12),notes='Engineering schematic mass geometry; sculptural finish excluded. Mass is source-linked, physical dimensions illustrative.')
 b=Builder()
 for x in (-4.5,4.5):
  for y in (-4.5,4.5):b.beam((x,y,dh+4.8),(x,y,dh+19),.15)
 b.mesh('TMD_CABLES',m['cable'],'TMD','damper_cables','悬挂钢索',(0,0,12))
 b=Builder();b.box((0,0,dh-5.2),(11,11,.40))
 b.mesh('TMD_DAMPER_PLATE',m['damper'],'TMD','damper_plate','固定铜板：涡流耗能',(0,0,12),notes='Fixed floor copper plate, sourced to Haskett (2017), STRUCTURE; dimensions illustrative.')
 b=Builder()
 for x in (-2.6,0,2.6):
  for y in (-2.6,0,2.6):b.box((x,y,dh-4.75),(1.5,1.5,.25))
 b.mesh('TMD_MAGNET_ARRAY',m['cable'],'TMD','damper_magnets','随质量块运动的磁阵',(0,0,12),notes='Rare-earth magnet array under pendulum; exact array layout simplified.')
 b=Builder()
 for x in (-5.4,5.4):b.beam((x,-8,dh+19),(x,8,dh+19),.8,1.0)
 for y in (-5.4,5.4):b.beam((-8,y,dh+19),(8,y,dh+19),.8,1.0)
 for x in (-6,6):
  for y in (-6,6):b.beam((x,y,dh-6),(x,y,dh+19),.65)
 b.mesh('TMD_SUPPORT_FRAME',m['steel'],'TMD','damper_support','承挂钢架',(0,0,12),notes='Based on Gensler public concept drawing; dimensions simplified for mechanism demonstration.')
 # Every parent can be animated without reinterpreting its children origins.
 bpy.context.view_layer.update()
 allgroups=[]
 for name,ob in GROUPS.items():
  names={c.name for c in ob.children_recursive};desc=[p for p in PARTS if p['id'] in names]
  if desc:
   lo=[min(p['bboxThree'][0][i] for p in desc) for i in range(3)];hi=[max(p['bboxThree'][1][i] for p in desc) for i in range(3)]
   allgroups.append({'id':name,'parent':ob.parent.name if ob.parent else None,'groupCenterThree':[(a+b)/2 for a,b in zip(lo,hi)],'bboxThree':[lo,hi],'explodeVectorThree':desc[0]['explodeVectorThree'],'children':[c.name for c in ob.children]})
 bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
 bpy.context.scene.world.color=(.82,.87,.89)
 bpy.ops.wm.save_as_mainfile(filepath=str(MODEL/'shanghai-tower.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/'shanghai-tower.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
 force_zone=4;ci=6;za=ZONES[force_zone];zb=za-8.6;fz=min(levels,key=lambda z:abs(z-(za-4)))
 cx,cy=colxy(za,ci);ang=math.atan2(cy,cx);unit=Vector((math.cos(ang),math.sin(ang),0));r0=core_radius(za,ang)
 floor_load=(unit.x*inner(fz)*.81,unit.y*inner(fz)*.81,fz+.17)
 floor_core=(unit.x*core_radius(fz,ang),unit.y*core_radius(fz,ang),fz+.17)
 force={'units':'metres; Y-up','educational_only':True,'floorLoad':{'node':'FLOORS_Z04_FRONT','point':three(floor_load)},'floorCoreContact':{'node':'CORE_Z04_W4','point':three(floor_core)},'outriggerCore':{'node':'OUTRIGGERS_Z04_TRUSS','point':three((unit.x*r0,unit.y*r0,zb))},'outriggerColumn':{'node':'OUTRIGGERS_Z04_TRUSS','point':three((cx,cy,zb))},'columnRaftSupport':{'node':'RAFT','point':three((*colxy(0,ci),raft_top))},'columnPath':[three((*colxy(z,ci),z)) for z in [zb,*list(reversed(ZONES[1:force_zone])),0,raft_top]]}
 tmd={'massNode':'TMD_MASS','massCenter':three((0,0,dh)),'cables':[{'top':three((x,y,dh+19)),'bottom':three((x,y,dh+4.8))} for x in (-4.5,4.5) for y in (-4.5,4.5)],'cableLength':14.2,'topSupportNode':'TMD_SUPPORT_FRAME','movingNodes':['TMD_MASS','TMD_MAGNET_ARRAY'],'fixedNodes':['TMD_SUPPORT_FRAME','TMD_DAMPER_PLATE'],'schematic':True}
 manifest={'schema':'rainbow.shanghai-tower/1','title':'上海中心可分解教学模型','units':'metres','coordinate_system':'GLB Y-up; Blender [x,y,z] → Three [x,z,-y]','ground_datum_y':0,'rest_pose':'assembled','glb_contains_animation':False,'all_part_origins':'world origin (0,0,0)','parameters':PARAM,'source_parameter_file':'research/model-source-parameters.json','parts':PARTS,'groups':allgroups,'forceAnchorsThree':force,'tmdAnchorsThree':tmd,'limits':['Educational geometric reconstruction from public design literature, not a construction BIM.','No simulation or fabrication accuracy is implied by the mesh.','Rounded triangular facade curve, core/floor/member dimensions, intermediate floor spacing and pile locations are approximations unless explicitly listed as sourced.','TMD mass geometry is a mechanism schematic, not a replica of the artwork enclosure.']}
 jwrite(OUT/'shanghai-tower-manifest.json',manifest)
 jwrite(RESEARCH/'model-audit.json',{'part_count':len(PARTS),'group_count':len(GROUPS),'vertices':sum(p['vertices'] for p in PARTS),'polygons':sum(p['polygons'] for p in PARTS),'all_origins_zero':all(o.location.length<1e-6 for o in bpy.data.objects),'height_m':H,'pile_count':len(coords),'glass_slices':len([p for p in PARTS if p['role']=='outerglass']),'core_hollow':True,'floor_core_void':True,'zones':9,'foundation_contact':{'raft_top':raft_top,'raft_bottom':raft_bottom,'pile_top':raft_bottom,'basement_column_base':raft_top,'basement_column_top':0,'above_ground_column_base':0,'gap_m':0.0},'glb_bytes':(OUT/'shanghai-tower.glb').stat().st_size,'construction_accuracy_claim':False})
 print('TOWER_BUILD_COMPLETE',len(PARTS),(OUT/'shanghai-tower.glb').stat().st_size)
 if '--preview' in sys.argv:
  s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=True
  s.render.resolution_x=900;s.render.resolution_y=1200;s.render.resolution_percentage=100
  s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.80,.86,.88,1);s.world.node_tree.nodes.get('Background').inputs[1].default_value=.5
  for name,loc,power,size in [('Key',(400,-600,800),85000000,700),('Fill',(-450,100,500),38000000,600)]:
   d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,300))-o.location).to_track_quat('-Z','Y').to_euler()
  d=bpy.data.cameras.new('PreviewCamera');o=bpy.data.objects.new('PreviewCamera',d);s.collection.objects.link(o);o.location=(670,-980,560);o.rotation_euler=(Vector((0,0,282))-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=810;d.clip_end=10000;s.camera=o
  s.view_settings.view_transform='AgX';s.render.filepath=str(MODEL/'preview-assembled.png');bpy.ops.render.render(write_still=True)

if __name__=='__main__':build()
