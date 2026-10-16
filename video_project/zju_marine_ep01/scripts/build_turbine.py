"""Original educational 15-MW-scale direct-drive offshore turbine.

Blender Z-up => GLB Y-up. Units metres. Rotation axis X, front/nose +X.
R120 and 150 m hub height are visual scale references to IEA-15MW RWT;
all geometry is independently authored here, not official/engineering CAD.
"""
from __future__ import annotations
import bpy, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models'; QA=ROOT/'work/model-qa'
OUT.mkdir(parents=True,exist_ok=True); QA.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.unit_settings.system='METRIC'

# All geometric helpers take WORLD SPACE Blender Z-up coordinates. Reparenting
# always uses a saved world matrix after updating the dependency graph.
def parent_keep(obj, parent):
    bpy.context.view_layer.update()
    world=obj.matrix_world.copy()
    obj.parent=parent
    obj.matrix_parent_inverse=Matrix.Identity(4)
    bpy.context.view_layer.update()
    obj.matrix_world=world
    bpy.context.view_layer.update()
    return obj

def material(name,col,metal=0,rough=.35):
    m=bpy.data.materials.new(name); m.diffuse_color=(*col,1); m.use_nodes=True
    p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if p is None:
        p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value=(*col,1); p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough; p.inputs['Coat Weight'].default_value=.26
    p.inputs['Coat Roughness'].default_value=.22
    return m
PEARL=material('Pearl_White_Coated_Aluminium',(.79,.85,.88),.13,.24)
BLADE=material('Blade_Ivory_Composite',(.89,.91,.88),.02,.3)
CYAN=material('Brand_Teal_Anodised',(.023,.33,.40),.52,.23)
STEEL=material('Brushed_Titanium',(.26,.33,.37),.82,.29)
DARK=material('Graphite_Cast_Steel',(.04,.07,.085),.46,.42)
COPPER=material('Copper_Windings',(.57,.205,.065),.8,.26)
SILVER=material('Machined_Silver',(.5,.57,.60),.85,.24)
MAGNET=material('Permanent_Magnets_Ceramic',(.05,.23,.29),.65,.27)
INSULATION=material('Winding_Insulation',(.2,.10,.054),.12,.42)
YELLOW=material('Safety_Ochre',(.88,.44,.055),.18,.32)
RUBBER=material('Panel_Seal',(.026,.04,.046),.02,.52)
RED=material('Service_Coral',(.49,.12,.065),.28,.32)

root=bpy.data.objects.new('TurbineEducationalModel_ORIGINAL',None); bpy.context.collection.objects.link(root)
root['provenance']='Original procedural educational model; approximate IEA15MW R120/hub150m scale, not official CAD.'

def group(name,loc=(0,0,0),parent=root):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=loc
    if parent:parent_keep(o,parent)
    return o

def finish(o,name,mat,parent=root,smooth=True,bevel=0):
    o.name=name
    if mat:o.data.materials.append(mat)
    if smooth:
        for p in o.data.polygons:p.use_smooth=True
    if bevel:
        b=o.modifiers.new('Manufactured_edge_radius','BEVEL'); b.width=bevel; b.segments=3
    if parent:parent_keep(o,parent)
    return o

def mesh(name,vs,fs,mat,parent=root,smooth=True,bevel=0):
    me=bpy.data.meshes.new(name+'_mesh'); me.from_pydata(vs,[],fs); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    return finish(o,name,mat,parent,smooth,bevel)

def box(name,loc,size,mat,parent=root,bevel=.08,rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object; o.dimensions=size
    if rotation:o.rotation_euler=rotation
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,parent,False,bevel)

def cylinder(name,loc,r,depth,mat,axis=(0,0,1),parent=root,bevel=.05,n=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=loc)
    o=bpy.context.object; o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat,parent,True,bevel)

def rod(name,a,b,r,mat,parent=root,n=16):
    a,b=Vector(a),Vector(b)
    return cylinder(name,(a+b)*.5,r,(b-a).length,mat,b-a,parent,min(.03,r*.35),n)

def annulus(name,loc,rin,rout,depth,mat,axis=(1,0,0),parent=root,n=96):
    # local radial plane YZ; apply X-axis orientation to any requested axis
    q=Vector((1,0,0)).rotation_difference(Vector(axis).normalized())
    p=Vector(loc); vs=[]
    for x,r in ((-depth/2,rin),(-depth/2,rout),(depth/2,rin),(depth/2,rout)):
        for j in range(n):
            a=j*math.tau/n; vs.append(tuple(p+q@Vector((x,r*math.cos(a),r*math.sin(a)))))
    fs=[]
    for j in range(n):
        k=(j+1)%n
        fs.extend([(j,k,n+k,n+j),(2*n+j,3*n+j,3*n+k,2*n+k),(n+j,n+k,3*n+k,3*n+j),(j,2*n+j,2*n+k,k)])
    return mesh(name,vs,fs,mat,parent,True,.025)

def torus(name,loc,r,t,mat,axis=(1,0,0),parent=root):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=64,minor_segments=12,location=loc)
    o=bpy.context.object; o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat,parent,True,0)

def bolt_circle(name,loc,r,count,axis,parent,bolt_r=.085):
    q=Vector((1,0,0)).rotation_difference(Vector(axis).normalized()); p=Vector(loc)
    for k in range(count):
        a=k*math.tau/count; pt=p+q@Vector((0,r*math.cos(a),r*math.sin(a)))
        cylinder(f'{name}_{k:02d}',pt,bolt_r,.18,SILVER,axis,parent,.01,6)

foundation=group('FoundationAssembly'); tower=group('TowerAssembly'); nacelle=group('NacelleAssembly')
rotor=group('RotorAssembly',(14,0,150)); blades=group('Blades',(14,0,150),rotor); hub=group('Hub',(14,0,150),rotor)
gen_rot=group('GeneratorRotor',(1,0,150)); gen_st=group('GeneratorStator',(1,0,150))
for o in (rotor,blades,hub,gen_rot,gen_st):o['rotation_axis']='X'

# External EngineeringFoundations supplies jacket / pile foundation at y=14 m.
# A single turbine machine is shared by all foundation choices. No monopile is
# baked into the export, so a jacket never contains an impossible central pile.
foundation['foundation_interface_m']=14.0
bpy.ops.mesh.primitive_cone_add(vertices=96,radius1=5,radius2=3,depth=132,location=(0,0,80))
finish(bpy.context.object,'TowerShell',PEARL,tower,True,.1)
for height in (38,76,112):
    rad=5-2*(height-14)/132
    annulus(f'TowerFlange_{height}',(0,0,height),rad-.035,rad+.018,.05,STEEL,axis=(0,0,1),parent=tower)
annulus('TowerBaseConnection',(0,0,14.22),4.65,5.23,.34,STEEL,axis=(0,0,1),parent=tower)
bolt_circle('TowerBaseBolt',(0,0,14.42),4.98,40,(0,0,1),tower,.075)
box('TowerAccessDoor',(4.92,0,16.0),(.10,1.25,2.5),DARK,tower,.13)
box('TowerAccessInset',(4.98,0,16.05),(.08,1.02,2.21),PEARL,tower,.1)
box('TowerDoorHandle',(5.055,.39,15.9),(.09,.045,.40),SILVER,tower,.025)
annulus('YawBearing',(0,0,145.8),2.42,3.72,1.0,DARK,axis=(0,0,1),parent=nacelle)
annulus('YawBearingTealTrim',(0,0,146.34),2.45,3.78,.12,CYAN,axis=(0,0,1),parent=nacelle)
bolt_circle('YawRingBolt',(0,0,146.48),3.38,28,(0,0,1),nacelle,.1)

# Separate streamlined shell panels: each can be faded or translated away.
# Width/height are half extents. Four smooth shell surfaces share exact seams.
stations=[(-19,.04,.06),(-18.5,2.9,3.4),(-17.5,5.0,5.6),(-16.0,5.72,6.35),(-13.0,6.12,6.52),(-6,6.35,6.65),(1,6.35,6.65),(6,6.02,6.35),(10,5.23,5.55),(11.1,2.95,3.1),(12,2.8,3.0)]
def envelope_at(x):
    for i in range(len(stations)-1):
        x0,w0,h0=stations[i];x1,w1,h1=stations[i+1]
        if x<=x1:
            f=max(0,min(1,(x-x0)/(x1-x0)));return (w0+(w1-w0)*f,h0+(h1-h0)*f)
    return stations[-1][1:]
def shell_y(x,z):
    w,h=envelope_at(x);return w*max(0,1-abs((z-150)/h)**(2/.75))**(.75/2)
# Piecewise loft samples stay on the documented envelope. Subdivision is omitted
# because it shrank the former envelope through the generator outer flange.
loft_stations=[]
for k in range(len(stations)-1):
    for step in range(7):
        x=stations[k][0]+(stations[k+1][0]-stations[k][0])*step/7
        w,h=envelope_at(x);loft_stations.append((x,w,h))
loft_stations.append(stations[-1])
def hull_panel(name,lo,hi,mat):
    vs=[]; fs=[]; n=22
    for x,w,h in loft_stations:
        for j in range(n+1):
            a=lo+(hi-lo)*j/n
            # squircle-style shell: roomy machine envelope, rounded corners
            c,s=math.cos(a),math.sin(a)
            y=w*math.copysign(abs(c)**.75,c); z=150+h*math.copysign(abs(s)**.75,s)
            vs.append((x,y,z))
    for i in range(len(loft_stations)-1):
        for j in range(n):k=i*(n+1)+j;fs.append((k,k+1,k+n+2,k+n+1))
    o=mesh(name,vs,fs,mat,nacelle,True)
    sol=o.modifiers.new('Shell_laminate','SOLIDIFY');sol.thickness=.08;sol.offset=1
    o['cutaway_panel']=True
    return o
shells=[hull_panel('NacelleShellRoof',math.pi*.2,math.pi*.8,PEARL),hull_panel('NacelleShellPort',math.pi*.8,math.pi*1.25,PEARL),hull_panel('NacelleShellBelly',math.pi*1.25,math.pi*1.75,PEARL),hull_panel('NacelleShellStarboard',math.pi*1.75,math.pi*2.2,PEARL)]
# deliberate branding seam; no writing/logo embedded in mesh
for side in (-1,1):
    for k in range(18):
        xa=-13+k;xb=xa+1
        rod(f'NacelleTealBelt_{side}_{k}',(xa,side*(shell_y(xa,150.2)+.025),150.2),(xb,side*(shell_y(xb,150.2)+.025),150.2),.045,CYAN,nacelle)
    # rear cooling grille slats sit on the shell side
    for k in range(10):
        xx=-12+k*.42
        box(f'CoolingIntake_{side}_{k}',(xx,side*(shell_y(xx,151.2)+.075),151.2),(.14,.095,1.05),DARK,nacelle,.035)
# bedplate: two long I-shaped beams with crossmembers
for y in (-2.45,2.45):
    box(f'BedplateWeb_{y}',(-3,y,146.8),(26,.42,1.45),DARK,nacelle,.12)
    for z in (146.15,147.45):box(f'BedplateFlange_{y}_{z}',(-3,y,z),(26,1.05,.23),STEEL,nacelle,.075)
for x in (-13,-7,0,7):box(f'BedplateCrossmember_{x}',(x,0,146.95),(.5,5.0,.8),DARK,nacelle,.1)
# rotor shaft is the same X-axis that passes through the generator/hub.
shaft=cylinder('MainShaft',(6.0,0,150),1.22,16,STEEL,(1,0,0),rotor,.10)
for x in (7.8,11.1):
    annulus(f'MainBearingHousing_{x}',(x,0,150),1.26,2.0,.8,DARK,parent=nacelle)
    annulus(f'MainBearingOuterRing_{x}',(x+.43,0,150),1.27,1.85,.12,SILVER,parent=nacelle)
    bolt_circle(f'MainBearingBolt_{x}',(x+.51,0,150),1.64,16,(1,0,0),nacelle,.074)
    for side in (-1,1):
        yy=1.25 if x>10 else 1.6
        zz=148.3 if x>10 else 148.1
        ww=.55 if x>10 else .8
        box(f'BearingPedestal_{x}_{side}',(x,side*yy,zz),(1.15,ww,1.8),STEEL,nacelle,.16)

# Generator is a coaxial radial-flux PM machine; rotor magnets face stator teeth.
annulus('GeneratorRotorDrum',(1,0,150),3.70,4.25,2.4,DARK,parent=gen_rot)
annulus('GeneratorRotorFrontRim',(2.30,0,150),3.55,4.29,.23,STEEL,parent=gen_rot)
annulus('GeneratorRotorRearRim',(-.30,0,150),3.55,4.29,.23,STEEL,parent=gen_rot)
# radial spokes connect the large drum to shaft, leaving readable openings.
for k in range(8):
    a=k*math.tau/8
    rod(f'RotorSpiderSpoke_{k}',(1,.95*math.cos(a),150+.95*math.sin(a)),(1,3.85*math.cos(a),150+3.85*math.sin(a)),.18,STEEL,gen_rot)
for k in range(32):
    a=k*math.tau/32
    # local box dimensions X/tangential/radial rotated around X
    o=box(f'RotorMagnet_{k:02}',(1,4.32*math.cos(a),150+4.32*math.sin(a)),(2.0,.63,.18),MAGNET,gen_rot,.04)
    o.rotation_euler[0]=a-math.pi/2
annulus('GeneratorStatorYoke',(1,0,150),4.93,5.36,2.9,DARK,parent=gen_st)
# visible slots, teeth and copper end-turns; each winding is embedded in its slot.
for k in range(48):
    a=k*math.tau/48; radial=Vector((0,math.cos(a),math.sin(a)))
    for nm,r,dims,mt in [('StatorTooth',4.76,(2.66,.18,.42),STEEL),('CopperSlot',4.96,(2.56,.38,.18),COPPER)]:
        o=box(f'{nm}_{k:02}',Vector((1,0,150))+radial*r,dims,mt,gen_st,.035)
        o.rotation_euler[0]=a-math.pi/2
    for side in (-1,1):
        # four close copper rails resemble layered end turns, no floating cubes.
        for turn in range(3):
            r=4.74+turn*.105; x=1+side*(1.65+turn*.035)
            q=box(f'CopperEndTurn_{k:02}_{side}_{turn}',(x,r*math.cos(a),150+r*math.sin(a)),(.10,.48,.065),COPPER,gen_st,.03)
            q.rotation_euler[0]=a-math.pi/2
annulus('StatorMachinedFlange_Front',(2.56,0,150),5.15,5.48,.17,SILVER,parent=gen_st)
annulus('StatorMachinedFlange_Rear',(-.56,0,150),5.15,5.48,.17,SILVER,parent=gen_st)
bolt_circle('GeneratorCaseBolt',(2.69,0,150),5.23,36,(1,0,0),gen_st,.079)
# supports from generator case to bedplate
for side in (-1,1):box(f'GeneratorSaddle_{side}',(1,side*3.15,146.65),(3.5,1.0,1.1),DARK,nacelle,.14)
# A disc brake aft of generator, caliper fixed to bedplate.
annulus('BrakeDisc',(-2.4,0,150),1.05,2.20,.23,STEEL,parent=rotor)
for side in (-1,1):box(f'BrakeCaliper_{side}',(-2.4,side*2.02,149.8),(.75,.48,1.1),RED,nacelle,.12)

# Converter/power cabinets behind the generator, cable ladder and cooling rack.
for i,x in enumerate((-7.2,-9.3,-11.4)):
    box(f'PowerCabinet_{i}',(x,-1.25,148.65),(1.72,2.25,3.0),PEARL,nacelle,.12)
    box(f'PowerCabinetDoor_{i}',(x,-2.40,148.65),(1.53,.055,2.78),STEEL,nacelle,.06)
    box(f'PowerCabinetDisplay_{i}',(x,-2.445,149.2),(.45,.025,.28),CYAN,nacelle,.025)
    box(f'PowerCabinetHandle_{i}',(x+.60,-2.48,148.6),(.035,.03,.45),SILVER,nacelle,.01)
    for j in range(7):box(f'CabinetVent_{i}_{j}',(x,-2.45,147.7+j*.08),(1.2,.02,.035),DARK,nacelle,.01)
# cooler at rear / starboard
box('CoolerCore',(-11,2.6,149.5),(6.6,1.65,3.3),DARK,nacelle,.15)
for k in range(32):box(f'CoolerFin_{k:02}',(-14.05+k*.197,3.45,149.5),(.045,.12,3.0),SILVER,nacelle,.015)
for k,x in enumerate((-12.7,-10.7,-8.7)):
    annulus(f'CoolingFanFrame_{k}',(x,3.63,149.5),.67,.83,.13,STEEL,axis=(0,1,0),parent=nacelle,n=48)
    cylinder(f'CoolingFanHub_{k}',(x,3.74,149.5),.17,.16,DARK,(0,1,0),nacelle,.03,32)
    for j in range(5):
        a=j*math.tau/5
        rod(f'CoolingFanBlade_{k}_{j}',(x+.15*math.cos(a),3.72,149.5+.15*math.sin(a)),(x+.63*math.cos(a+.2),3.72,149.5+.63*math.sin(a+.2)),.11,DARK,nacelle)
for side in (-1,1):
    rod(f'CoolingPipe_{side}',(-12,side*.7,150.6),(-3,side*.7,150.6),.075,COPPER,nacelle)
# floor grating and aisle, with a removable safety rail close to the bedplate
box('MaintenanceWalkway',(-5,-3.42,147.38),(19,1.22,.16),STEEL,nacelle,.045)
for k in range(36):box(f'WalkwaySlot_{k}',(-14.0+k*.50,-3.42,147.48),(.09,1.05,.025),DARK,nacelle,.01)
for x in (-14,-10,-6,-2,4):rod(f'MaintenanceRailPost_{x}',(x,-4.02,147.5),(x,-4.02,148.58),.035,YELLOW,nacelle)
rod('MaintenanceHandrail',(-14,-4.02,148.58),(4,-4.02,148.58),.04,YELLOW,nacelle)
# roof escape hatch / small service crane
box('RoofHatch',(-8,0,156.68),(2.1,1.75,.14),STEEL,nacelle,.15)
box('RoofHatchInset',(-8,0,156.78),(1.77,1.42,.06),PEARL,nacelle,.13)
rod('AnemometerMast',(-12,0,156.55),(-12,0,159.2),.08,STEEL,nacelle)
rod('AnemometerBar',(-12,-.72,159.05),(-12,.72,159.05),.04,STEEL,nacelle)
for y in (-.72,.72):cylinder(f'AnemometerCup_{y}',(-12,y,159.05),.16,.2,DARK,parent=nacelle,bevel=.04,n=20)

# Streamlined spinner: ellipse of revolution about X, widest near blade roots.
sp=[(11.8,2.55),(12.5,3.45),(14.0,3.90),(16.0,3.48),(18.3,2.16),(20.0,.32),(20.18,.035)]
vs=[];fs=[];N=64
for x,r in sp:
    for j in range(N):a=j*math.tau/N;vs.append((x,r*math.cos(a),150+r*math.sin(a)))
for k in range(len(sp)-1):
    for j in range(N):i=k*N+j;fs.append((i,k*N+(j+1)%N,(k+1)*N+(j+1)%N,i+N))
spinner=mesh('HubSpinner',vs,fs,PEARL,hub)
sub=spinner.modifiers.new('Smooth_spinner','SUBSURF');sub.levels=2
annulus('HubRearSeal',(12.15,0,150),2.32,2.65,.20,RUBBER,parent=hub)

# Each blade starts as an actual circular root section normal to its RADIAL axis,
# transitions through thick cambered airfoil, then thins/twists toward a fine tip.
# Quarter-chord curves and thicknesses are educational approximations, not IEA CAD.
shape=[(3.5,5.2,1.0,0),(6,5.2,.92,11),(10,5.8,.60,14),(17,6.6,.40,13),(28,6.0,.32,10),(44,5.0,.27,7),(65,3.8,.23,4.5),(87,2.7,.20,2.5),(106,1.7,.18,1),(116,.92,.16,0),(120,.16,.12,0)]
def interp(r,col):
    for i in range(len(shape)-1):
        if r<=shape[i+1][0]:
            f=(r-shape[i][0])/(shape[i+1][0]-shape[i][0]); f=f*f*(3-2*f)
            return shape[i][col]*(1-f)+shape[i+1][col]*f
    return shape[-1][col]
blade_objs=[]
for b,ang in enumerate((90,210,330)):
    a=math.radians(ang); radial=Vector((0,math.cos(a),math.sin(a))); tang=Vector((0,-math.sin(a),math.cos(a)))
    blade_g=group(f'BladeAssembly_{b+1}',Vector((14,0,150))+radial*3.5,blades)
    blade_g['pitch_axis_world']=list(radial); blade_g['radial_angle_blender_deg']=ang
    root_c=Vector((14,0,150))+radial*3.90
    annulus(f'BladeRootBearing_{b+1}',root_c,2.27,2.76,.72,STEEL,axis=radial,parent=blade_g)
    bolt_circle(f'BladeRootBolt_{b+1}',root_c+radial*.43,2.52,24,radial,blade_g,.08)
    vs=[];fs=[];nr=48;nc=48
    for k in range(nr+1):
        r=4.26+(120-4.26)*k/nr;ch=interp(r,1);th=interp(r,2);tw=math.radians(interp(r,3))
        # tangential chord, axial thickness. +X curves gently upwind at tip.
        center=Vector((14+2.15*((r-4.26)/(120-4.26))**2,0,150))+radial*r
        chord_dir=tang*math.cos(tw)+Vector((1,0,0))*math.sin(tw)
        thick_dir=Vector((1,0,0))*math.cos(tw)-tang*math.sin(tw)
        blend=max(0,min(1,(r-6)/12));blend=blend*blend*(3-2*blend)
        for j in range(nc):
            q=math.tau*j/nc; xc=(1-math.cos(q))*.5
            circular=math.sin(q)*ch*.5
            # NACA closed trailing edge, full thickness is th*ch (not doubled).
            yt=5*min(th,.6)*ch*(.2969*math.sqrt(max(xc,0))-.1260*xc-.3516*xc**2+.2843*xc**3-.1036*xc**4)
            foil=math.copysign(yt,math.sin(q))+(.018*ch*math.sin(math.pi*xc))
            thickness=circular*(1-blend)+foil*blend
            p=center+chord_dir*((xc-.5)*ch)+thick_dir*thickness
            vs.append(tuple(p))
    for k in range(nr):
        for j in range(nc):i=k*nc+j;fs.append((i,k*nc+(j+1)%nc,(k+1)*nc+(j+1)%nc,i+nc))
    fs.append(tuple(range(nc-1,-1,-1)));fs.append(tuple(nr*nc+j for j in range(nc)))
    obj=mesh(f'Blade_{b+1}',vs,fs,BLADE,blade_g);obj['span_to_tip_m']=120;blade_objs.append(obj)
    # pinstripe small enough to read as a material detail, not multicolour noise.
    # Internal pitch ring and 4 radial actuating bolt bosses remain with each blade.
    annulus(f'BladePitchRing_{b+1}',Vector((14,0,150))+radial*4.43,2.37,2.68,.15,CYAN,axis=radial,parent=blade_g)

# Packaging QA: inspect every evaluated vertex of all interior meshes against
# the nacelle inner superellipse, rather than trusting object origins or only AABBs.
# The main shaft intentionally goes through the front aperture; tower/yaw and
# exterior safety/weather hardware intentionally touch the outer body.
bpy.context.view_layer.update()
external_prefixes=('NacelleShell','NacelleTeal','CoolingIntake','RoofHatch','Anemometer','Yaw')
interior=[]
for o in [*nacelle.children_recursive,*gen_rot.children_recursive,*gen_st.children_recursive]:
    if o.type!='MESH' or o.name.startswith(external_prefixes):continue
    interior.append(o)
interior_qa=[];violations=[]
deps=bpy.context.evaluated_depsgraph_get()
for o in interior:
    ev=o.evaluated_get(deps); me=ev.to_mesh();verts=[ev.matrix_world@v.co for v in me.vertices]
    worst=0;min_margin=999
    for p in verts:
        w,h=envelope_at(p.x);n=1/.75
        # Surface formula is sign(cos)^.75 / sign(sin)^.75, so 2/.75 is
        # the superellipse exponent (cos²+sin²=1).
        n=2/.75;score=(abs(p.y)/(w-.12))**n+(abs(p.z-150)/(h-.12))**n
        worst=max(worst,score);min_margin=min(min_margin,w-abs(p.y),h-abs(p.z-150))
        if p.x<stations[0][0] or p.x>stations[-1][0]:worst=999
    bbox={'min':[min(p[k] for p in verts) for k in range(3)],'max':[max(p[k] for p in verts) for k in range(3)]}
    item={'name':o.name,'envelope_max':round(worst,5),'axis_margin_m':round(min_margin,4),'bbox_blender':bbox}
    interior_qa.append(item)
    if worst>1.0:violations.append(item)
    ev.to_mesh_clear()
# All rotor phases must clear the fixed front casing: test the circular root
# collars and blade root vertices near the fixed shell for 72 absolute phases.
rotor_shell_min=1e9;rotor_shell_samples=0
for o in blades.children_recursive:
    if o.type!='MESH':continue
    ev=o.evaluated_get(deps);me=ev.to_mesh()
    vv=[ev.matrix_world@v.co for v in me.vertices]
    for p in vv:
        if p.x>12 or p.x<-19:continue
        for phase in range(72):
            aa=phase*math.tau/72;dy=p.y*math.cos(aa)-(p.z-150)*math.sin(aa);dz=p.y*math.sin(aa)+(p.z-150)*math.cos(aa)
            w,h=envelope_at(p.x);score=(abs(dy)/(w+.08))**(2/.75)+(abs(dz)/(h+.08))**(2/.75)
            rotor_shell_min=min(rotor_shell_min,score);rotor_shell_samples+=1
    ev.to_mesh_clear()
assert rotor_shell_min>1.0, f'Blade roots intersect stationary nacelle: {rotor_shell_min}'
(QA/'packaging-v4.json').write_text(json.dumps({'test':'evaluated vertex versus inner shell superellipse','checked_meshes':len(interior_qa),'rotor_shell_phases':72,'rotor_shell_samples':rotor_shell_samples,'rotor_shell_min_score':rotor_shell_min,'violations':violations,'meshes':interior_qa},ensure_ascii=False,indent=2),encoding='utf8')
assert not violations, f'Nacelle packaging collisions: {[(v["name"],v["envelope_max"]) for v in violations]}'

# --------------------- QA stage, not part of model export ---------------------
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.65
scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.48,.64,.74,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5

def light(name,loc,power,color,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
light('QA_Key',(90,-95,240),650000,(1,.91,.80),110,(0,0,140))
light('QA_Fill',(-70,90,190),470000,(.48,.73,1),95,(0,0,150))
light('QA_Rim',(60,90,270),500000,(.70,.86,1),70,(0,0,160))
d=bpy.data.lights.new('QA_Sun','SUN');d.energy=2;d.angle=math.radians(10);o=bpy.data.objects.new('QA_Sun',d);bpy.context.collection.objects.link(o);o.rotation_euler=(.5,-.4,-.4)
sea_mat=material('QA_Sea_Only',(.025,.16,.23),.15,.3)
sea=box('QA_Sea_Only',(0,0,-.5),(4000,4000,.8),sea_mat,parent=None,bevel=0)

def camera(name,pos,target,lens=50):
    d=bpy.data.cameras.new(name);d.lens=lens;d.clip_end=10000
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
hero=camera('QA_Hero',(680,-360,285),(0,0,126),45);scene.camera=hero
scene.render.filepath=str(QA/'hero.png')
if '--skip-render' not in sys.argv:bpy.ops.render.render(write_still=True)
# Hide skin and blades for a dedicated cutaway proof; the saved model remains assembled.
cutaway_hidden=[]
for o in root.children_recursive:
    if o.name.startswith('NacelleShell') or o.name.startswith('Blade') or o.name.startswith('Hub') or o.name.startswith('NacelleTeal') or o.name.startswith('CoolingIntake') or o.name.startswith('Anemometer') or o.name.startswith('RoofHatch'):
        if o.type=='MESH':o.hide_render=True;cutaway_hidden.append(o)
light('QA_InternalKey',(12,-18,169),9500,(1,.88,.74),14,(0,0,150))
light('QA_InternalFill',(-10,8,164),12000,(.65,.81,1),10,(0,0,150))
cam=camera('QA_Nacelle', (32,-47,174),(-3,0,150),55);scene.camera=cam
scene.render.filepath=str(QA/'nacelle_interior.png')
if '--skip-render' not in sys.argv:bpy.ops.render.render(write_still=True)
for o in cutaway_hidden:o.hide_render=False

# Validate correct pivot and world dimensions at random absolute rotor angles.
bpy.context.view_layer.update()
assert (rotor.matrix_world.translation-Vector((14,0,150))).length<1e-5
assert blades.parent==rotor and hub.parent==rotor
assert (bpy.data.objects['HubSpinner'].matrix_world @ Vector((0,0,0))).length < 1e-5, 'Authored mesh vertices use world coordinates with preserved parenting'
pts=[v.co.copy() for v in blade_objs[0].data.vertices]
base_world=[blade_objs[0].matrix_world @ p for p in pts];pivot=Vector((14,0,150))
base_radius=[(p-pivot).length for p in base_world]
checks=[]
for ang in (0,.314,1.271,2.73,4.191):
    rotor.rotation_euler.x=ang;bpy.context.view_layer.update()
    w=[blade_objs[0].matrix_world @ p for p in pts]
    err=max(abs((p-pivot).length-r) for p,r in zip(w,base_radius))
    checks.append({'angle_rad':ang,'radius_error_m':err,'max_span_radius_m':max((p-pivot).length for p in w)})
    assert err<.001,(ang,err)
rotor.rotation_euler.x=0;bpy.context.view_layer.update()
scene.camera=hero
bpy.ops.wm.save_as_mainfile(filepath=str(QA/'turbine.blend'))
# GLB excludes all QA surfaces, lights, cameras. Only model subtree selected.
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'turbine.glb'),export_format='GLB',export_yup=True,export_apply=True,use_selection=True,export_cameras=False,export_lights=False)
# Background GLB keeps every exterior detail from the hero: no primitive proxy.
# Scene code may merge by material and share geometry; only hidden internals are omitted.
bpy.ops.object.select_all(action='DESELECT')
for o in [root,*root.children_recursive]:
    chain=[];p=o
    while p is not None:chain.append(p.name);p=p.parent
    keep=bool(set(chain)&{'TowerAssembly','Blades','Hub'}) or o.name.startswith(('NacelleShell','NacelleTeal','CoolingIntake','RoofHatch','Anemometer','Yaw'))
    if keep or o.name in {'TurbineEducationalModel_ORIGINAL','FoundationAssembly','NacelleAssembly','RotorAssembly'}:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'turbine_lod.glb'),export_format='GLB',export_yup=True,export_apply=True,use_selection=True,export_cameras=False,export_lights=False)
manifest={
 'asset':'public/models/turbine.glb','background_lod':'public/models/turbine_lod.glb','background_same_exterior_details':True,'source':'work/model-qa/turbine.blend','builder':'scripts/build_turbine.py',
 'provenance':'Original educational geometry; approximate IEA15MW R120/hub150 scale; no official CAD copied',
 'reference':'https://github.com/IEAWindSystems/IEA-15-240-RWT','reference_accessed':'2026-10-13',
 'units':'m','blender_up':'Z','gltf_up':'Y','rotor_axis':'+X','nose':'+X',
 'world_positions_three':{'tower_axis_hub_height':[0,150,0],'RotorAssembly':[14,150,0],'GeneratorRotor':[1,150,0],'GeneratorStator':[1,150,0],'nacelle_extent_x':[-19,12],'tower_base_installation_y':14,'PowerCabinet_1':[-9.3,148.65,1.25],'tower_top':[0,146,0],'seabed':[0,-45,0]},
 'node_contract':{'RotorAssembly':'rotate .rotation.x = absolute angle; Blades+Hub+shaft+brake descendants','Blades':'3 BladeAssembly_i with root pivots','Hub':'spinner and seal','GeneratorRotor':'independent X pivot at [1,150,0]; synchronize same angle as RotorAssembly','GeneratorStator':'fixed copper coils/teeth/yoke','NacelleShell*':'4 independent shell meshes for transparency/cutaway','FoundationAssembly':'empty interface: scene adds jacket/land piles, tower base y14','TowerAssembly':'tapered original shell 10m bottom to 6m top'},
 'materials':[m.name for m in (PEARL,BLADE,CYAN,STEEL,DARK,COPPER,SILVER,MAGNET,INSULATION,YELLOW,RUBBER,RED)],
 'qa':{'packaging':'work/model-qa/packaging-v4.json','packaging_checked_meshes':len(interior_qa),'packaging_violations':len(violations),'pivot_checks':checks,'hero':'work/model-qa/hero.png','nacelle':'work/model-qa/nacelle_interior.png','export_contains_sea_camera_lights':False},
 'limitations':['Educational approximated aerofoil/internal packaging, not a manufacturer engineering model','No finite-element or aerodynamic simulation is represented by the geometry']}
manifest['sha256']=hashlib.sha256((OUT/'turbine.glb').read_bytes()).hexdigest()
(QA/'model-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('MODEL_OK',OUT/'turbine.glb', (OUT/'turbine.glb').stat().st_size)
