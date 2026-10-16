"""Authored V08 macro leaf reference and exact spherical raindrop.
No external generated assets; metric local scene, deterministic construction.
"""
import bpy, math, os, json, hashlib
from mathutils import Vector

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(ROOT,'public','assets_v08','macro')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def material(name,rgba,roughness=.35,transmission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    m.node_tree.nodes.clear();p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface']);p.inputs['Base Color'].default_value=rgba
    p.inputs['Roughness'].default_value=roughness
    p.inputs['Transmission Weight'].default_value=transmission
    p.inputs['IOR'].default_value=1.333 if transmission else 1.45
    p.inputs['Coat Weight'].default_value=.28 if not transmission else .2
    p.inputs['Coat Roughness'].default_value=.20
    m.diffuse_color=rgba;return m

leafmat=material('wet_botanical_satin',(0.040,0.145,0.076,1),.29)
veinmat=material('subtle_young_leaf_veins',(0.094,0.190,0.084,1),.37)
stemmat=material('warm_leaf_stem',(0.105,0.126,0.061,1),.48)
watermat=material('clean_water_ior_1.333',(0.92,0.97,1,1),.027,1)
assetobjects=[]

def ly(x,z):
    return -1.705+.10*math.cos(x*.43)+.045*math.sin(x*.88)-.032*z*z+.075*math.sin(x*.78)*z
def width(x):
    s=max(0,1-(x/4.7)**2)
    return 2.05*s**.78*(.97+.04*math.sin(x*1.1))

nx,nz=168,44;verts=[];faces=[]
for i in range(nx+1):
    x=-4.7+9.4*i/nx
    for j in range(nz+1):
        q=-1+2*j/nz;z=q*width(x)
        y=ly(x,z)+.006*math.sin(x*11+q*7)*abs(q)**3
        verts.append((x,y,z))
for i in range(nx):
    for j in range(nz):
        a=i*(nz+1)+j;faces.append((a,a+1,a+nz+2,a+nz+1))
g=bpy.data.meshes.new('smooth_curved_leaf_lamina');g.from_pydata(verts,[],faces);g.update()
leaf=bpy.data.objects.new('Wet leaf - curved lamina',g);bpy.context.collection.objects.link(leaf)
leaf.data.materials.append(leafmat)
for p in g.polygons:p.use_smooth=True
solid=leaf.modifiers.new('thin natural leaf margin','SOLIDIFY');solid.thickness=.009
solid.offset=0
assetobjects.append(leaf)

def curve(name,pts,radius,mat):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=12
    cu.bevel_depth=radius;cu.bevel_resolution=3;cu.resolution_u=12
    spl=cu.splines.new('POLY');spl.points.add(len(pts)-1)
    for p,co in zip(spl.points,pts):p.co=(*co,1)
    ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
    assetobjects.append(ob);return ob

curve('leaf midrib',[(x,ly(x,0)+.020,0) for x in [-4.85+i*9.60/110 for i in range(111)]],.018,veinmat)
for side in [-1,1]:
    for i in range(15):
        x0=-3.95+i*.52
        pts=[]
        for j in range(20):
            q=j/19;x=x0+.56*q;z=side*width(x)*q*.965
            pts.append((x,ly(x,z)+.013,z))
        curve('fine leaf vein %d %d'%(side,i),pts,.007,veinmat)
curve('arched supporting stem',[(4.2,-1.64,.0),(4.9,-1.7,.13),(5.55,-1.9,.38),(6.1,-2.13,.58)],.043,stemmat)

# A few physically shaped secondary beads give a scale reference; no particle field.
for i,(x,z,r) in enumerate([(-2.5,.52,.075),(-1.30,-.96,.096),(2.90,-.64,.070),(3.58,.36,.045),(-3.62,-.30,.043)]):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=r,location=(x,ly(x,z)+r*.65,z))
    bead=bpy.context.object;bead.name='quiet dew bead %02d'%i;bead.scale=(1,.83,1)
    bead.data.materials.append(watermat)
    for p in bead.data.polygons:p.use_smooth=True
    assetobjects.append(bead)

# Exact sphere: no drop-tail model, no displaced interface, no baked light pattern.
bpy.ops.mesh.primitive_uv_sphere_add(segments=192,ring_count=128,radius=1,location=(0,0,0))
drop=bpy.context.object;drop.name='exact spherical raindrop radius 1';drop.data.materials.append(watermat)
for vertex in drop.data.vertices:vertex.co.normalize()
for p in drop.data.polygons:p.use_smooth=True
bpy.ops.object.select_all(action='DESELECT');drop.select_set(True);bpy.context.view_layer.objects.active=drop
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'spherical_raindrop_v08.glb'),export_format='GLB',use_selection=True,export_yup=True)

drop.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
for ob in assetobjects:ob.select_set(True)
bpy.context.view_layer.objects.active=leaf
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'macro_leaf_v08.glb'),export_format='GLB',use_selection=True,export_yup=True)

# Blender uses Z up, Three uses Y up. Export_yup transforms authored coordinates.
# Model is authored in Blender XYZ as Three XYZ directly, so the import rotation
# is described in the manifest: root.rotation.x=+PI/2 to cancel export axis conversion.
drop.hide_set(False);drop.scale=(1.6,1.6,1.6)
world=bpy.data.worlds.new('quiet optical studio');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes.clear();bg=world.node_tree.nodes.new('ShaderNodeBackground');wo=world.node_tree.nodes.new('ShaderNodeOutputWorld');world.node_tree.links.new(bg.outputs['Background'],wo.inputs['Surface'])
bg.inputs['Color'].default_value=(.026,.075,.094,1)
bg.inputs['Strength'].default_value=.45
for name,loc,power,size,color in [('large softbox',(-4,5,7),1100,7,(.80,.93,1)),('warm rim',(4,2,-2),620,5,(1,.84,.63)),('long strip',(-3,0,-3),450,3,(.55,.78,1))]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    ob=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(ob);ob.location=loc
    ob.rotation_euler=(Vector((0,0,0))-ob.location).to_track_quat('-Z','Y').to_euler()
camd=bpy.data.cameras.new('macro review');cam=bpy.data.objects.new('macro review',camd);bpy.context.collection.objects.link(cam)
cam.location=(6,4.5,9);cam.rotation_euler=(Vector((0,-.35,0))-cam.location).to_track_quat('-Z','Y').to_euler();camd.lens=55
bpy.context.scene.camera=cam
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=48;sc.cycles.use_denoising=True
sc.render.resolution_x=960;sc.render.resolution_y=640;sc.render.resolution_percentage=100
sc.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'macro_leaf_raindrop_v08.blend'))
sc.render.filepath=os.path.join(OUT,'macro_leaf_blender_review_v08.png');bpy.ops.render.render(write_still=True)
manifest={'generator':'Blender local authored geometry','sphereLocalRadius':1,'sphereDisplayScale':1.6,'blenderExecutable':'D:/blender/blender.exe','leafObjects':len(assetobjects),'axisCorrectionRadiansX':math.pi/2,'originalCoordinates':'X width, Y up, Z depth; export_yup requires cancelling GLTF root correction','files':{}}
for name in ['spherical_raindrop_v08.glb','macro_leaf_v08.glb','macro_leaf_raindrop_v08.blend','macro_leaf_blender_review_v08.png']:
    path=os.path.join(OUT,name);manifest['files'][name]={'bytes':os.path.getsize(path),'sha256':hashlib.sha256(open(path,'rb').read()).hexdigest()}
with open(os.path.join(OUT,'provenance-v08.json'),'w',encoding='utf8') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
print(json.dumps({'output':OUT,'leafObjects':len(assetobjects)},ensure_ascii=False))
