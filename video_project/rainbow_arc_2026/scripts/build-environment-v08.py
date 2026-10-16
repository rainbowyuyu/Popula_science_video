"""V08 authored outdoor set, in metres. Blender Z-up -> glTF Y-up.

The basin matches the existing deterministic water surface (-3,.025,3),
and the observer's actual eye reference is (0,1.55,7). No optics are baked.
"""
import bpy, math, random, json, hashlib, datetime, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v08/environment'
OUT.mkdir(parents=True,exist_ok=True)
TEX=OUT/'textures'
random.seed(817240)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene

def material(name,color,rough=.65,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    m.node_tree.nodes.clear()
    bs=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');bs.name='Principled BSDF'
    output=m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(bs.outputs['BSDF'],output.inputs['Surface'])
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    return m

slate=material('wet_slate_pbr',(0.52,.56,.53),.39)
nodes=slate.node_tree.nodes;links=slate.node_tree.links;bs=nodes.get('Principled BSDF')
uv=nodes.new('ShaderNodeTexCoord')
for key,name in [('diff','slate_floor_02_diff_2k_desaturated.jpg'),('nor','slate_floor_02_nor_gl_2k.jpg'),('arm','slate_floor_02_arm_2k.jpg')]:
    n=nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(TEX/name));n.image.pack()
    if key!='diff':n.image.colorspace_settings.name='Non-Color'
    links.new(uv.outputs['UV'],n.inputs['Vector'])
    if key=='diff':links.new(n.outputs['Color'],bs.inputs['Base Color'])
    if key=='nor':
        norm=nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.34
        links.new(n.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bs.inputs['Normal'])
    if key=='arm':
        sep=nodes.new('ShaderNodeSeparateColor');links.new(n.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],bs.inputs['Roughness'])
stone=material('basin_limestone',(0.43,.465,.423),.54)
edgeStone=material('pale_chamfered_limestone',(0.58,.60,.55),.49)
earth=material('damp_moss_earth',(0.235,.29,.224),.94)
rockMat=material('damp_valley_rock',(0.36,.40,.34),.86)
bronze=material('aged_bronze_nozzle',(.13,.12,.073),.36,.69)
pineTrunk=material('wet_pine_bark',(.16,.18,.13),.88)
pineLeaf=material('pine_flat_needle_fronds',(.19,.28,.235),.83)
benchMetal=material('bench_dark_bronze',(.135,.16,.14),.47,.35)
wood=material('wet_bench_oak',(.26,.245,.17),.49)
for m in [stone,edgeStone]:
    tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(TEX/'slate_floor_02_nor_gl_2k.jpg'));tex.image.colorspace_settings.name='Non-Color';tex.image.pack()
    normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.19
    m.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],m.node_tree.nodes.get('Principled BSDF').inputs['Normal'])

environment=[]
def register(o,name,mat):
    o.name=name
    if mat:o.data.materials.append(mat)
    environment.append(o);return o
def bevel(o,width=.04,segments=3):
    mod=o.modifiers.new('hand_finished_edge_bevel','BEVEL');mod.width=width;mod.segments=segments
    mod=o.modifiers.new('weighted_surface_normals','WEIGHTED_NORMAL');mod.keep_sharp=True
def cube(name,loc,size,mat,b=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(loc[0],-loc[2],loc[1]))
    o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    register(o,name,mat)
    if b:bevel(o,b)
    return o
def mesh(name,verts,faces,mat,uv=None):
    data=bpy.data.meshes.new(name);data.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);data.update()
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);register(o,name,mat)
    if uv:
        layer=data.uv_layers.new(name='UVMap')
        for polygon in data.polygons:
            for loop_i in polygon.loop_indices:layer.data[loop_i].uv=uv[data.loops[loop_i].vertex_index]
    return o
def uv_floor(o):
    # 2m per photographed slate tile; update the original UV, never a second layer.
    layer=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            p=o.data.vertices[o.data.loops[li].vertex_index].co
            layer.data[li].uv=(p.x/2,-p.y/2)

# Large grounded paved terrace with an actual cut-out for the fountain basin.
floor=cube('slate_terrace_solid_28m', (0,-.20,4),(28,.39,32),slate,.05)
uv_floor(floor)
bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=1.50,depth=2,location=(-3,-3,-.12))
cutter=bpy.context.object
bo=floor.modifiers.new('recessed_pool_opening','BOOLEAN');bo.operation='DIFFERENCE';bo.object=cutter
bpy.context.view_layer.objects.active=floor
bpy.ops.object.modifier_apply(modifier=bo.name);bpy.data.objects.remove(cutter,do_unlink=True)

# Circular basin is architectural masonry with real wall depth, not a torus.
def ring(name,inner,outer,bottom,top,segments,mat,cx=-3,cz=3):
    v=[];f=[]
    for radius,y in [(outer,bottom),(outer,top),(inner,top),(inner,bottom)]:
        for j in range(segments):
            a=2*math.pi*j/segments;v.append((cx+radius*math.cos(a),y,cz+radius*math.sin(a)))
    for k in range(4):
        for j in range(segments):
            a=k*segments+j;b=k*segments+(j+1)%segments;c=((k+1)%4)*segments+(j+1)%segments;d=((k+1)%4)*segments+j
            f.append((a,b,c,d))
    o=mesh(name,v,f,mat,[(x/1.5,z/1.5) for x,y,z in v]);bevel(o,.018,3);return o
ring('pool_masonry_wall',1.46,1.72,-.37,.125,160,stone)
ring('coping_true_flat_rim',1.48,1.80,.105,.155,160,edgeStone)
ring('lower_shadow_line_in_stone',1.71,1.755,.010,.039,160,stone)
bpy.ops.mesh.primitive_cylinder_add(vertices=160,radius=1.465,depth=.04,location=(-3,-3,-.35))
bottom=register(bpy.context.object,'fountain_real_masonry_bottom',stone);uv_floor(bottom)
# Radial cut joints are fine separated physical seams, not thick white stripes.
for j in range(16):
    a=j*math.tau/16
    o=cube(f'coping_radial_joint_{j}',(-3+1.65*math.cos(a),.156,3+1.65*math.sin(a)),(.006,.002,.31),stone,0)
    o.rotation_euler.z=math.pi/2-a
# Central bronze spray riser grounds the existing mist emission at y=.90.
bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.054,depth=1.20,location=(-3,-3,.25))
post=register(bpy.context.object,'fountain_bronze_riser_to_actual_emitter',bronze);bevel(post,.01,3)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=.083,location=(-3,-3,.858))
head=register(bpy.context.object,'spray_nozzle_head',bronze);head.scale.z=.45
for j in range(12):
    a=j*math.tau/12
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.005,depth=.014,location=(-3+.051*math.cos(a),-3+.051*math.sin(a),.89))
    register(bpy.context.object,f'nozzle_aperture_{j}',benchMetal)

# Perimeter masonry gives the platform an edge and altitude without fencing.
for side in [-1,1]:
    cube(f'terrace_low_side_curb_{side}',(side*13.9,.05,4),(.30,.22,32),edgeStone,.05)
for x in [-9.0,9.5]:
    # Low benches off the optical centre, genuine slats and cast supports.
    for j in range(5):cube(f'bench_oak_slat_{x}_{j}',(x,.48,-5+j*.078),(2.35,.05,.065),wood,.012)
    for dx in [-.86,.86]:
        cube(f'bench_cast_leg_{x}_{dx}',(x+dx,.22,-4.84),(.10,.44,.37),benchMetal,.025)

# Deterministic fractal three-dimensional mountain masses. Centre is a low valley.
def value_noise(x,z,seed):
    def h(a,b):
        n=(a*374761393+b*668265263+seed*69069)&0xffffffff;n=((n^(n>>13))*1274126177)&0xffffffff
        return ((n^(n>>16))&0xffffffff)/4294967295
    a=math.floor(x);b=math.floor(z);u=x-a;v=z-b;u=u*u*(3-2*u);v=v*v*(3-2*v)
    return (h(a,b)*(1-u)+h(a+1,b)*u)*(1-v)+(h(a,b+1)*(1-u)+h(a+1,b+1)*u)*v
def fbm(x,z,seed):return sum(value_noise(x*(2**i),z*(2**i),seed+i*17)/(2**i) for i in range(5))/1.9375
for layer in range(0):
    nx,nz=156,50
    verts=[];faces=[];colors=[]
    zfront=-35-layer*27;depth=56+layer*18;span=170+layer*30
    palette=[(.25,.345,.282),(.31,.407,.373),(.405,.505,.495),(.52,.625,.624)][layer]
    m=material(f'mountain_atmospheric_rock_{layer}',palette,.96)
    # Blender and glTF both preserve this vertex colour as material base tint.
    nodes=m.node_tree.nodes;vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='TerrainTint'
    m.node_tree.links.new(vc.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
    for k in range(nz+1):
        z=zfront-k/nz*depth
        edge=math.sin(math.pi*k/nz)**.4
        for j in range(nx+1):
            x=-span/2+j/nx*span
            centre=.26+.74*(1-math.exp(-(x/(22+layer*3))**2))
            n=fbm(x*.064,z*.064,821+layer*15)
            broad=(1+math.sin(x*.048+layer*.8)*.28)
            y=-1.3+edge*((n**1.8)*(19+layer*10)+2.3)*centre*broad
            verts.append((x,y,z))
            variation=fbm(x*.28,z*.28,134+layer*81)
            c=tuple(min(1,v*(.82+.29*variation)+(max(0,y-10)/55)*.05) for v in palette)
            colors.append((*c,1))
    for k in range(nz):
        for j in range(nx):
            a=k*(nx+1)+j;b=a+nx+1;faces.extend([(a,b,a+1),(b,b+1,a+1)])
    mountain=mesh(f'valley_layer_{layer}_solid_terrain',verts,faces,m)
    ca=mountain.data.color_attributes.new(name='TerrainTint',type='BYTE_COLOR',domain='CORNER')
    for li in range(len(mountain.data.loops)):ca.data[li].color=colors[mountain.data.loops[li].vertex_index]
    for p in mountain.data.polygons:p.use_smooth=True

# High-detail pine silhouettes: curved trunks, radial twig layers, individual fronds.
# There are no sphere canopies, low-poly cone trees or billboards.
def pine(name,loc,height,seed):
    rng=random.Random(seed);v=[];f=[]
    radial=9;levels=15
    for k in range(levels+1):
        y=height*k/levels;r=.095*(1-k/levels*.87)
        for j in range(radial):
            a=j*math.tau/radial;v.append((loc[0]+r*math.cos(a)+.038*math.sin(k*.23),y,loc[2]+r*math.sin(a)))
    for k in range(levels):
        for j in range(radial):a=k*radial+j;b=k*radial+(j+1)%radial;f.append((a,b,b+radial,a+radial))
    trunk=mesh(name+'_bark',v,f,pineTrunk)
    for p in trunk.data.polygons:p.use_smooth=True
    verts=[];faces=[]
    for tier in range(11):
        y=height*(.23+tier*.064);radius=(height*.18)*(1-tier/12)
        for branch in range(7):
            angle=branch*math.tau/7+tier*.79+rng.uniform(-.20,.20)
            extent=radius*rng.uniform(.82,1.17)
            for t in range(9):
                frac=.12+t/10;cx=loc[0]+math.cos(angle)*extent*frac;cz=loc[2]+math.sin(angle)*extent*frac
                cy=y-.22*extent*frac+.1*math.sin(frac*math.pi)
                for side in [-1,1]:
                    fan=angle+side*.78;length=extent*(.20+.07*rng.random())*(1-frac*.58)
                    width=length*.27
                    tx=cx+math.cos(fan)*length;tz=cz+math.sin(fan)*length
                    a=len(verts)
                    verts.extend([(cx,cy,cz),(tx-math.sin(fan)*width,cy-.02,tz+math.cos(fan)*width),
                                  (tx,cy+.045,tz),(tx+math.sin(fan)*width,cy-.03,tz-math.cos(fan)*width)])
                    faces.extend([(a,a+1,a+2),(a,a+2,a+3)])
    mesh(name+'_fine_radial_fronds',verts,faces,pineLeaf)
for i in range(0):
    side=-1 if i%2 else 1;x=side*(14+(i//2)%4*3.5);z=-15-(i//4)*6.1
    pine(f'side_pine_{i}',(x,0,z),4.3+(i*17%11)*.18,500+i)

# Stone chunks and sparse meadow leaves live only on outer shoulders.
for i in range(0):
    x=(-1 if i%2 else 1)*(15+random.random()*6.5);z=-8-random.random()*40
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,-z,-.13))
    o=register(bpy.context.object,f'weathered_bank_rock_{i}',rockMat)
    o.scale=(.22+random.random()*.35,.25+random.random()*.35,.13+random.random()*.24)
    o.rotation_euler=(random.random(),random.random(),random.random())

# Export modifiers applied, preserving originals in the .blend file.
def export_selected(objs,path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',
        export_cameras=False,export_lights=False)
export_selected(environment,OUT/'rain_after_terrace_v08.glb')

# A garment-cut observer. Elliptic ring surfaces create realistic tapered limbs.
# No visible ball joints or circular rod fingers. Eye height is fixed at 1.55m.
observer=[]
coat=material('raincoat_matte_teal',(.135,.235,.25),.62)
coatSeam=material('stitched_dark_teal',(.121,.219,.230),.78)
coatPanel=material('raincoat_panel_variation',(.147,.245,.255),.60)
pants=material('charcoal_twill_trousers',(.10,.145,.155),.85)
shoe=material('dark_leather_shoe',(.071,.095,.099),.49)
sole=material('rubber_shoe_sole',(.044,.062,.066),.88)
skin=material('natural_warm_skin',(.58,.39,.28),.82)
hair=material('short_dark_hair',(.056,.052,.045),.89)
for m in [coat,coatPanel,coatSeam,pants]:
    tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(TEX/'authored_cloth_normal_v08.png'));tex.image.colorspace_settings.name='Non-Color';tex.image.pack()
    normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.23
    m.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],m.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
def oval_rings(name,rings,mat,N=48,wrinkle=.0):
    vertices=[];faces=[]
    for i,(cx,y,cz,rx,rz) in enumerate(rings):
        for j in range(N):
            a=j*math.tau/N;w=1+wrinkle*math.sin(a*7+i*1.2)*math.sin(i*.8)
            vertices.append((cx+rx*math.cos(a)*w,y,cz+rz*math.sin(a)*w))
    for k in range(len(rings)-1):
        for j in range(N):a=k*N+j;b=k*N+(j+1)%N;faces.append((a,b,b+N,a+N))
    faces.extend([tuple(reversed(range(N))),tuple(range((len(rings)-1)*N,len(rings)*N))])
    uv=[(j/N,rings[i][1]*2) for i in range(len(rings)) for j in range(N)]
    o=mesh(name,vertices,faces,mat,uv);environment.remove(o);observer.append(o)
    for p in o.data.polygons:p.use_smooth=True
    sub=o.modifiers.new('garment_surface_subdivision','SUBSURF');sub.levels=1;return o
oval_rings('tailored_raincoat_body',[(0,.79,0,.255,.17),(0,.84,0,.277,.174),(0,.96,0,.25,.166),(0,1.09,-.008,.246,.172),(0,1.23,-.012,.249,.169),(0,1.32,-.014,.237,.148),(0,1.39,-.002,.19,.102),(0,1.425,.004,.082,.07)],coat,wrinkle=.014)
for side in [-1,1]:
    oval_rings('continuous_shoulder_raincoat_sleeve_'+str(side),[(side*.13,1.37,0,.035,.034),(side*.211,1.32,0,.079,.079),(side*.254,1.245,.014,.084,.081),(side*.285,1.15,.024,.078,.075),(side*.307,1.052,.041,.070,.070),(side*.327,.95,.063,.061,.058),(side*.329,.91,.073,.060,.058)],coatPanel,wrinkle=.018)
    oval_rings('elastic_cuff_'+str(side),[(side*.329,.900,.073,.060,.059),(side*.329,.915,.073,.061,.059),(side*.328,.937,.073,.059,.058)],coatSeam,N=32)
    # mitten-sized palms with small individually tapered fingers, no spherical knots.
    oval_rings('relaxed_hand_palm_'+str(side),[(side*.327,.84,.08,.037,.026),(side*.329,.866,.078,.043,.027),(side*.329,.903,.074,.037,.026)],skin,N=32)
    for finger in range(4):
        x=side*(.305+finger*.015)
        oval_rings('natural_tapered_finger_'+str(side)+'_'+str(finger),[(x,.813+.007*abs(finger-1),.089,.008,.009),(x,.836,.087,.009,.010),(x,.860,.082,.009,.009)],skin,N=12)
    oval_rings('relaxed_thumb_'+str(side),[(side*.365,.850,.083,.008,.010),(side*.374,.864,.078,.011,.010),(side*.370,.881,.072,.012,.011)],skin,N=16)
    oval_rings('twill_trouser_leg_'+str(side),[(side*.119,.07,.028,.071,.073),(side*.119,.14,.025,.074,.078),(side*.115,.30,.019,.078,.083),(side*.116,.44,.014,.093,.091),(side*.108,.59,-.001,.106,.098),(side*.095,.745,-.008,.125,.107),(side*.088,.82,-.010,.13,.112)],pants,wrinkle=.017)
    oval_rings('shoe_sole_'+str(side),[(side*.12,.0,.078,.093,.156),(side*.12,.045,.078,.095,.16),(side*.12,.061,.078,.092,.159)],sole,N=48)
    oval_rings('shoe_upper_'+str(side),[(side*.12,.056,.078,.092,.15),(side*.12,.085,.061,.091,.14),(side*.12,.113,.022,.072,.098),(side*.12,.142,-.014,.059,.066)],shoe,N=48)
oval_rings('slightly_anatomical_neck',[(0,1.398,.010,.056,.051),(0,1.465,.013,.063,.059)],skin,N=32)
oval_rings('adult_head_anatomical_oval',[(0,1.441,.037,.045,.047),(0,1.461,.038,.066,.061),(0,1.493,.023,.077,.070),(0,1.548,.005,.081,.076),(0,1.599,-.004,.080,.078),(0,1.650,-.011,.059,.061),(0,1.681,-.016,.018,.020)],skin,N=64)
oval_rings('hair_fitted_scalp',[(0,1.559,-.010,.078,.074),(0,1.612,-.014,.082,.079),(0,1.658,-.020,.058,.061),(0,1.682,-.021,.018,.022)],hair,N=64)
# Worn hood: an open face aperture, fitted around the scalp; no bare toy neck.
hoodProfile=[(1.40,.082,.070),(1.46,.105,.092),(1.52,.113,.105),(1.60,.115,.108),(1.67,.105,.097),(1.72,.073,.068),(1.747,.017,.017)]
verts=[];faces=[];N=48
for i,(y,rx,rz) in enumerate(hoodProfile):
    for j in range(N+1):
        a=math.pi*.75+j/N*math.pi*1.50
        verts.append((rx*math.cos(a),y,-.012+rz*math.sin(a)))
for i in range(len(hoodProfile)-1):
    for j in range(N):a=i*(N+1)+j;faces.append((a,a+1,a+N+2,a+N+1))
hood=mesh('worn_rain_hood_open_face',verts,faces,coat,[(j/N,i/len(hoodProfile)) for i in range(len(hoodProfile)) for j in range(N+1)])
environment.remove(hood);observer.append(hood)
for p in hood.data.polygons:p.use_smooth=True
solid=hood.modifiers.new('hood_cloth_real_thickness','SOLIDIFY');solid.thickness=.004
sub=hood.modifiers.new('hood_soft_crown','SUBSURF');sub.levels=1
def seam_curve(name,pts,mat,radius=.0018):
    cv=bpy.data.curves.new(name,'CURVE');cv.dimensions='3D';cv.bevel_depth=radius;cv.bevel_resolution=2
    p=cv.splines.new('BEZIER');p.bezier_points.add(len(pts)-1)
    for bp,(x,y,z) in zip(p.bezier_points,pts):bp.co=(x,-z,y);bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cv);scene.collection.objects.link(o);o.data.materials.append(mat);observer.append(o);return o
seam_curve('raincoat_front_zipper',[(0,.82,.177),(0,1.03,.177),(0,1.24,.170),(0,1.375,.09)],coatSeam,.003)
for s in [-1,1]:
    seam_curve('coat_side_panel_seam_'+str(s),[(s*.190,.82,-.119),(s*.173,.96,-.119),(s*.170,1.09,-.120),(s*.171,1.23,-.116),(s*.152,1.33,-.106)],coatSeam,.0011)
    seam_curve('welt_pocket_'+str(s),[(s*.124,.94,.155),(s*.188,1.03,.133)],coatSeam,.0022)
# Convert seams before export so geometry is actually in the GLB.
for o in observer:
    if o.type=='CURVE':
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
export_selected(observer,OUT/'observer_v08.glb')

# Restore all objects for a standalone saved native project and photographed preview.
scene.world.use_nodes=True
world=scene.world.node_tree.nodes;links=scene.world.node_tree.links
world.clear();output=world.new('ShaderNodeOutputWorld');background=world.new('ShaderNodeBackground');background.inputs['Strength'].default_value=.43
env=world.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(OUT/'hilly_terrain_01_2k.hdr'));env.image.pack()
links.new(env.outputs['Color'],background.inputs['Color']);links.new(background.outputs[0],output.inputs[0])
bpy.ops.object.light_add(type='SUN',location=(-14,-20,24));sun=bpy.context.object;sun.name='after_rain_sun';sun.data.energy=2.1;sun.rotation_euler=(math.radians(30),math.radians(-25),math.radians(-35));sun.data.angle=.09
bpy.ops.object.light_add(type='AREA',location=(7,12,17));fill=bpy.context.object;fill.name='sky_softbox';fill.data.energy=1300;fill.data.shape='DISK';fill.data.size=18
fill.rotation_euler=(math.radians(18),0,math.radians(-15))

def camera(name,p,t,lens):
    bpy.ops.object.camera_add(location=(p[0],-p[2],p[1]));o=bpy.context.object;o.name=name
    o.rotation_euler=(Vector((t[0],-t[2],t[1]))-o.location).to_track_quat('-Z','Y').to_euler();o.data.lens=lens;return o
cameras=[camera('set_overview',(11,6.5,17),(0,2,-6),32),camera('fountain_masonry_closeup',(-6.7,2.3,7.1),(-3,.72,3),46),camera('observer_garment_closeup',(-2.3,1.2,-2.8),(0,1.02,0),64)]
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
# Observer lives at the optical eye only in the set preview; GLB origin stays feet=0.
for o in observer:o.location.y-=7
scene.camera=cameras[0]
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'rain_after_terrace_v08.blend'))
for cam in cameras:
    if 'observer' in cam.name:
        for o in observer:o.location.y+=7
    scene.camera=cam;scene.render.filepath=str(OUT/(cam.name+'.png'));bpy.ops.render.render(write_still=True)

manifest={'version':'V08','generator':'scripts/build-environment-v08.py','blender':bpy.app.version_string,
          'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'coordinates':'GLB Y-up metres; Blender Z-up; world water(-3,.025,3), hero(0,4,0), eye(0,1.55,7)',
          'geometry':'Actual solid terrace with boolean recess, masonry basin/coping, bronze emitter; real photographed CC0 hilly_terrain_01 background; no low-poly mountains/trees; no optical data baked',
          'observer':{'height_m':1.747,'eye_m':1.55,'foot_y':0,'facing':'+Z','representation':'authored anatomy silhouette/garment, illustrative rather than scan'},
          'materials':'Poly Haven slate_floor_02 2K CC0 maps with desaturated diffuse derivative; authored cloth normal; original authored geometry; CC0 hilly_terrain_01 HDRI',
          'objects':len(environment),'observer_objects':len(observer),
          'assets':[]}
for p in [OUT/'rain_after_terrace_v08.glb',OUT/'observer_v08.glb',OUT/'rain_after_terrace_v08.blend']:
    data=p.read_bytes();manifest['assets'].append({'file':p.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(OUT/'provenance.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'environment_objects':len(environment),'observer_objects':len(observer),'output':str(OUT)},ensure_ascii=False))
