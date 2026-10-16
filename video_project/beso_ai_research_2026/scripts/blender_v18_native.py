"""v18 visual platform revision from user reference. Not a new solver model."""
import bpy,bmesh,json,math,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/v18';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'public/beso-research/physics/native-model.json'
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.unit_settings.system='METRIC'
def mat(name,c,rough=.4,metal=.1):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
pearl=mat('Porcelain marine epoxy',(.74,.77,.70),.32,.18);teal=mat('Graphite teal ballast coating',(.025,.095,.105),.34,.32);gold=mat('Champagne nickel seam',(.48,.34,.16),.29,.72);steel=mat('Brushed stainless hardware',(.29,.34,.33),.28,.80);dark=mat('Recess charcoal',(.012,.021,.025),.5,.15)
parts=[];details=[];moorings=[];columns=[]
def finish(o,name,ma,bevel=.10):
 o.name=name;o.data.materials.append(ma);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('Rounded fabrication edges','BEVEL');m.width=bevel;m.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 for p in o.data.polygons:p.use_smooth=True
 m=o.modifiers.new('Area weighted corner normals','WEIGHTED_NORMAL');m.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=m.name);return o
def cylinder(name,a,b,r,ma,bevel=.1):
 a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');return finish(o,name,ma,bevel)
def box(name,c,d,ma,bevel=.1):
 bpy.ops.mesh.primitive_cube_add(size=1,location=c);o=bpy.context.object;o.dimensions=d;return finish(o,name,ma,bevel)
def beam(name,a,b,width,height,ma):
 a,b=Vector(a),Vector(b);o=box(name,(a+b)/2,(width,height,(b-a).length),ma,.24);o.rotation_mode='QUATERNION';o.rotation_quaternion=(b-a).to_track_quat('Z','Y');return o
def torus(name,c,major,minor,normal,ma):
 bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=12,location=c,major_radius=major,minor_radius=minor);o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector(normal).to_track_quat('Z','Y');o.data.materials.append(ma)
 for f in o.data.polygons:f.use_smooth=True
 return o
# Coordinates are in Blender Z-up, metres. Flat base disks have exactly vertical axes.
for i,ang in enumerate([math.pi,math.pi/3,-math.pi/3]):
 radial=Vector((math.cos(ang),math.sin(ang),0));tangent=Vector((-math.sin(ang),math.cos(ang),0));c=radial*47.0
 base=cylinder(f'BallastBase_{i+1}',c+Vector((0,0,-4.6)),c+Vector((0,0,1.8)),10.9,teal,.24);parts.append(base)
 lower=c+Vector((0,0,1.4));upper=c+radial*(26.6*math.tan(math.radians(6)))+Vector((0,0,28.0));col=cylinder(f'OuterColumn_{i+1}',lower,upper,7.8,pearl,.17);parts.append(col)
 # Small inclined axis, but the broad low ballast base remains level.
 columns.append({'side':i+1,'baseCenter':list(c),'baseBottomZ':-4.6,'baseTopZ':1.8,'baseRadiusM':10.9,'columnStart':list(lower),'columnEnd':list(upper),'columnTiltDeg':6})
 details.append(torus(f'BaseWeld_{i+1}',c+Vector((0,0,1.82)),10.65,.10,(0,0,1),gold))
 details.append(torus(f'ColumnRootWeld_{i+1}',lower+Vector((0,0,.4)),7.79,.09,(upper-lower),gold))
 # Broad closed diagonal box brace intersects both the column and central receiver.
 a=radial*4.0+Vector((0,0,21.0));b=radial*46.5+Vector((0,0,6.2));parts.append(beam(f'RadialBrace_{i+1}',a,b,8.4,6.0,pearl))
 # Restrained longitudinal seam on the brace, and recessed maintenance panel at top.
 details.append(beam(f'BraceSeam_{i+1}',a+Vector((0,0,.17)),b+Vector((0,0,.17)),.10,6.08,gold))
 hatch=box(f'ColumnHatch_{i+1}',upper+Vector((0,0,.10)),(3.8,2.7,.14),steel,.15);details.append(hatch)
 for j,offset in enumerate([-4.8,-1.6,1.6,4.8]):
  # Each eye is welded into the OUTBOARD SIDE of the bottom ballast base.
  along=math.sqrt(10.9**2-offset**2);mount=c+radial*along+tangent*offset+Vector((0,0,.55));eye=mount+radial*.65+Vector((0,0,.12))
  plate=beam(f'EarWeldSide_{i+1}_{j+1}',mount-radial*.8,eye,1.35,1.8,steel);details.append(plate)
  details.append(torus(f'FairleadEye_{i+1}_{j+1}',eye,.66,.21,tangent,steel))
  # Smooth line path is visual only; the original source record is not overwritten.
  anchor=c+radial*470+tangent*(offset*5)+Vector((0,0,-62));paths=[]
  for k in range(49):
   q=k/48;p=anchor.lerp(eye,q);p.z=anchor.z+(eye.z-anchor.z)*(q**4.0);paths.append([p.x,p.y,p.z])
  moorings.append({'line':i*4+j+1,'side':i+1,'fairleadXYZ':list(eye),'mountXYZ':list(mount),'anchorXYZ':list(anchor),'visualPolylineXYZ':paths,'binding':'bottom ballast outboard welded eye; visual layout revision, not saved solver line geometry'})
# The tower receiver is supported by the three radial braces.
# There is NO fourth central column or central ballast foot below the hub.
parts.append(cylinder('CentralHub',(0,0,20.3),(0,0,28.0),10.8,pearl,.20))
details.append(torus('HubLowerWeld',(0,0,20.4),10.73,.10,(0,0,1),gold));details.append(torus('TowerFootRing',(0,0,28.05),5.55,.14,(0,0,1),gold))
for n in range(32):
 a=n/32*math.tau;details.append(cylinder(f'TowerBolt_{n}',(5.45*math.cos(a),5.45*math.sin(a),28.03),(5.45*math.cos(a),5.45*math.sin(a),28.25),.13,steel,.025))
# Keep named components. They intersect at load-transfer joints; no loose floating rods.
for o in parts:o['visual_revision_v18']=True;o['solver_geometry']=False
bpy.ops.object.select_all(action='DESELECT')
for o in parts+details:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'reference-platform.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
# Upper machine is dimensionally scaled from the source: 136.7 m tower and 131 m blade skin.
upperparts=[]
bpy.ops.mesh.primitive_cone_add(vertices=96,radius1=5.35,radius2=3.1,depth=136.7,location=(0,0,28+136.7/2));upperparts.append(finish(bpy.context.object,'Tower',pearl,.06))
for z in [28,64,99,133,164.7]:upperparts.append(torus('TowerFlange_'+str(z),(0,0,z),5.35-(z-28)/136.7*2.25,.045,(0,0,1),steel))
upperparts.append(box('Nacelle',(6.7,0,166.4),(15.0,6.7,6.2),pearl,.95));upperparts.append(box('RearVent',(14.25,0,166.4),(.07,5.6,4.4),dark,.08))
for j in range(12):upperparts.append(box(f'NacelleLouvre_{j}',(14.3,0,164.6+j*.31),(.12,5.5,.09),steel,.03))
upperparts.append(cylinder('RotorHub',(-4.6,0,166.4),(-.8,0,166.4),3.3,pearl,.5))
# Swept tapered aerofoil loft around X-axis rotor: no flat triangular propeller.
for n in range(3):
 phi=n*2*math.pi/3;verts=[];faces=[];rings=48;sides=20
 for r in range(rings+1):
  q=r/rings;span=3.0+128*q;chord=(4.8*math.sin(math.pi*min(1,q*1.15))**.5+1.05)*(1-.60*q);thick=chord*(.23-.13*q);sweep=-5.5*q*q;twist=.24*(1-q)
  for k in range(sides):
   a=k/sides*math.tau;xx=-5.0+math.sin(a)*thick;yy=sweep+math.cos(a)*chord;zz=span
   yy,xx=yy*math.cos(twist)-(xx+5)*math.sin(twist),(xx+5)*math.cos(twist)+yy*math.sin(twist)-5
   verts.append((xx,yy*math.cos(phi)-zz*math.sin(phi),166.4+yy*math.sin(phi)+zz*math.cos(phi)))
 for r in range(rings):
  for k in range(sides):a=r*sides+k;b=r*sides+(k+1)%sides;c=b+sides;d=a+sides;faces.append((a,b,c,d))
 faces.append(tuple(range(sides-1,-1,-1)));faces.append(tuple(rings*sides+k for k in range(sides)))
 mesh=bpy.data.meshes.new('AerofoilSkin');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(f'Blade_{n+1}',mesh);scene.collection.objects.link(o);o.data.materials.append(pearl)
 for f in mesh.polygons:f.use_smooth=True
 upperparts.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in upperparts:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'turbine-upper.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
layout={'schema':'v18-visual-layout','units':'m','upAxis':'z','sourceModelSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceChanged':False,'baseType':'three flat horizontal circular ballast bases','columnTiltDeg':6,'towerBaseZM':28,'centralSupport':'hub only; no central keel or foot','outerColumnCount':3,'baseCount':3,'chainType':'full-length alternating-link anchor chain from outboard padeye to anchor, above and below water','columns':columns,'moorings':moorings,'claimBoundary':'User-reference visual layout revision. Original Zwind response is separate archived evidence; no old rigid-body displacement is imposed on this changed layout.'}
(OUT/'visual-layout.json').write_text(json.dumps(layout,indent=2),encoding='utf-8')
scene['claim_boundary']=layout['claimBoundary'];bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'reference-platform-source.blend'))
print(json.dumps({'blender':bpy.app.version_string,'parts':len(parts),'details':len(details),'upperParts':len(upperparts),'mooringCount':len(moorings),'outerColumnCount':3,'removedParts':['CentralKeel','CentralFoot'],'baseDisksHorizontal':True,'sourceChanged':False,'boundary':layout['claimBoundary']}))
