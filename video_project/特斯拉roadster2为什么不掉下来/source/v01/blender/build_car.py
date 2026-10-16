"""Original stylized teaching vehicle, not Tesla CAD or a verified nozzle layout.
Blender and exported mesh data both use x-forward/y-left/z-up, metres.
Run from project root: blender --background --python source/v01/blender/build_car.py
"""
from pathlib import Path
import bpy, json, math, hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/v01'; OUT.mkdir(parents=True,exist_ok=True)
# Factory startup only affects this background session, no existing project is loaded.
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name,color,metal=0.0,rough=.4,emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emission
    return m
red=material('Ruby ceramic',(0.52,.025,.045),.68,.24)
rubber=material('Tire charcoal',(.018,.024,.031),.12,.66)
rim=material('Machined alloy',(.39,.46,.53),.85,.22)
glass=material('Dark canopy',(.025,.075,.11),.45,.16)
carbon=material('Underbody',(.035,.045,.058),.6,.35)
teal=material('Left side marker',(.035,.82,.72),.25,.25,1.0)
white=material('Headlight',(.7,.88,1),.05,.25,3)
rear=material('Rear lamp',(.8,.02,.035),.15,.3,2)

def cube(name,loc,scale,mat,bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Rounded edges','BEVEL');mod.width=bevel;mod.segments=3
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o

def loft(name,sections,mat):
    # Each section: x, half width, lower and upper z; four corners, consistent topology.
    verts=[]
    for x,w,low,high in sections:verts.extend([(x,-w,low),(x,w,low),(x,w,high),(x,-w,high)])
    faces=[(3,2,1,0)]
    for i in range(len(sections)-1):
        a=4*i;b=a+4
        for j in range(4):faces.append((a+j,a+(j+1)%4,b+(j+1)%4,b+j))
    a=4*(len(sections)-1);faces.append((a,a+1,a+2,a+3))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat)
    bevel=obj.modifiers.new('Body radii','BEVEL');bevel.width=.075;bevel.segments=3
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.modifier_apply(modifier=bevel.name);obj.select_set(False)
    for p in mesh.polygons:p.use_smooth=True
    return obj

loft('Teaching coupe body',[(-2.1,.78,-.23,.08),(-1.65,.96,-.26,.31),(-.5,.98,-.25,.29),(.65,.94,-.24,.23),(1.65,.86,-.23,.12),(2.15,.72,-.18,-.01)],red)
loft('Canopy',[(-1.05,.71,.25,.34),(-.65,.69,.26,.78),(.22,.66,.24,.76),(.91,.70,.20,.24)],glass)
cube('Roof spine',(-.20,0,.79),(1.13,.09,.055),red,.025)
cube('Splitter',(1.85,0,-.25),(.56,1.64,.075),carbon,.025)
cube('Flat floor',(0,0,-.285),(3.5,1.60,.11),carbon,.03)
for y in [-.99,.99]:
    cube('Side sill',(0,y,-.18),(3.55,.07,.13),red,.025)
    for x in [-1.35,1.36]:
        # Cylinder local z axis -> global y; tyres span width along y.
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.39,depth=.25,location=(x,y,-.18),rotation=(math.pi/2,0,0))
        o=bpy.context.object;o.name='Wheel tire';o.data.materials.append(rubber)
        bevel=o.modifiers.new('Tire shoulders','BEVEL');bevel.width=.055;bevel.segments=3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        for p in o.data.polygons:p.use_smooth=True
        bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=.27,depth=.26,location=(x,y,-.18),rotation=(math.pi/2,0,0))
        o=bpy.context.object;o.name='Alloy rim';o.data.materials.append(rim)
        for a in range(5):
            ang=a*2*math.pi/5
            spoke=cube('Spoke',(x+.12*math.cos(ang),y+(.14 if y>0 else -.14),-.18+.12*math.sin(ang)),(.25,.025,.045),carbon,.008)
            spoke.rotation_euler[1]=-ang
    cube('Headlight',(2.02,y*.63,.065),(.08,.46,.06),white,.02)
    cube('Tail light',(-2.05,y*.58,.12),(.06,.56,.055),rear,.018)
    cube('Teaching nozzle pod',(0,y*.89,-.33),(.27,.25,.15),rim,.035)
cube('Left identification stripe',(-.3,1.025,.0),(2.2,.018,.065),teal,.008)

# Export evaluated vertices in world/body coordinates. This avoids ambiguous glTF up-axis conversions.
deps=bpy.context.evaluated_depsgraph_get();objects=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH':continue
    ev=obj.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles()
    pos=[];norm=[]
    for tri in me.loop_triangles:
        for vi in tri.vertices:
            v=me.vertices[vi];p=ev.matrix_world@v.co
            n=(ev.matrix_world.to_3x3().inverted().transposed()@v.normal).normalized()
            pos.extend(p);norm.extend(n)
    mat=obj.data.materials[0];bs=mat.node_tree.nodes.get('Principled BSDF')
    objects.append({'name':obj.name,'positions':pos,'normals':norm,'color':list(mat.diffuse_color)[:3],
      'metalness':float(bs.inputs['Metallic'].default_value),'roughness':float(bs.inputs['Roughness'].default_value),
      'emissiveStrength':float(bs.inputs['Emission Strength'].default_value)})
    ev.to_mesh_clear()
meshpath=OUT/'teaching-car.mesh.json'
meshpath.write_text(json.dumps({'coordinateSystem':'x-forward/y-left/z-up','origin':'assumed teaching centre of mass','units':'m','notTeslaCAD':True,'objects':objects},separators=(',',':')),encoding='utf-8')
# Blender inspection camera and studio lighting; model remains separate and reusable.
world=bpy.data.worlds.new('Studio world');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.018,.025,.045,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.35
for name,loc,power,size in [('Key',(3,-4,6),1800,5),('Rim',(-3,3,4),2000,4),('Front',(5,3,2),700,3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Inspection camera');cam=bpy.data.objects.new('Inspection camera',data);bpy.context.collection.objects.link(cam)
cam.location=(6,-8,4);cam.rotation_euler=(Vector((0,0,.1))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=6.3
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'teaching-car.blend'))
scene.render.filepath=str(OUT/'teaching-car-inspection.png');bpy.ops.render.render(write_still=True)
(OUT/'model-manifest.json').write_text(json.dumps({'meshSha256':hashlib.sha256(meshpath.read_bytes()).hexdigest(),'meshCount':len(objects),'dimensionsAssumedM':[4.3,2.25,1.36],'verifiedTeslaGeometry':False,'blender':bpy.app.version_string},indent=2),encoding='utf-8')
print('MODEL_COMPLETE',meshpath)
