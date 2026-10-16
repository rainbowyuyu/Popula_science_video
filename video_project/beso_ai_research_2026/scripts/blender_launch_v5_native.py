"""Import the exact v5 display shell for CPU-only geometry inspection.

No image rendering, no GPU use. This .blend is a presentation source around
the unchanged native solver axes. The JS/Three.js shell remains the animated
film's renderer; these meshes do not replace the saved Z-wind response.
"""
import bpy
import json
import math
import hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/v5'
OUT.mkdir(parents=True,exist_ok=True)
payload=json.loads((ROOT/'work/v5-native-qa/presentation-meshes.json').read_text())
native=json.loads((ROOT/'public/beso-research/physics/native-model.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
collection=bpy.data.collections.new('Native v5 fabrication display shells')
scene.collection.children.link(collection)

def vector(p):return (p[0],-p[2],p[1])
vertex_count=0
for source in payload['meshes']:
    points=[vector(p) for p in source['positions']]
    if not all(math.isfinite(x) for p in points for x in p):raise RuntimeError('Nonfinite geometry: '+source['name'])
    faces=[tuple(source['indices'][i:i+3]) for i in range(0,len(source['indices']),3)]
    mesh=bpy.data.meshes.new(source['name'])
    mesh.from_pydata(points,[],faces);mesh.update()
    obj=bpy.data.objects.new(source['name'],mesh);collection.objects.link(obj)
    material=bpy.data.materials.new(source['name']+' / finish');material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*source['color'],1)
    shader.inputs['Roughness'].default_value=source['roughness']
    shader.inputs['Metallic'].default_value=source['metalness']
    if source['colors']:
        colors=mesh.color_attributes.new(name='FabricatedCoat',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(colors.data):c.color=(*source['colors'][i*3:i*3+3],1)
        vertex_color=material.node_tree.nodes.new('ShaderNodeVertexColor');vertex_color.layer_name='FabricatedCoat'
        material.node_tree.links.new(vertex_color.outputs['Color'],shader.inputs['Base Color'])
    mesh.materials.append(material)
    for polygon in mesh.polygons:polygon.use_smooth=True
    for key,value in source['userData'].items():
        if isinstance(value,(int,float,str,bool)):obj[key]=value
    obj['display_geometry']=True
    vertex_count+=len(points)

axes=bpy.data.collections.new('Read-only solver centreline witnesses')
scene.collection.children.link(axes)
for element in native['elements']:
    a=native['nodes'][str(element['from'])];b=native['nodes'][str(element['to'])]
    curve=bpy.data.curves.new('Native axis '+str(element['id']),'CURVE');curve.dimensions='3D'
    spline=curve.splines.new('POLY');spline.points.add(1)
    spline.points[0].co=(*a,1);spline.points[1].co=(*b,1)
    obj=bpy.data.objects.new(curve.name,curve);axes.objects.link(obj)
    obj.hide_render=True;obj.hide_viewport=True;obj['native_length_m']=(Vector(b)-Vector(a)).length

def camera(name,location,target,lens=48):
    data=bpy.data.cameras.new(name);data.lens=lens
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    obj.location=location;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj
scene.camera=camera('Whole wind turbine / uninterrupted orbit reference',(290,-330,160),(0,0,100),44)
camera('Continuous hub-to-brace-to-column view',(-112,-126,39),(-27,0,-3),50)
camera('Outer column fishmouth close inspection',(-70,-27,-4),(-44.46,0,-13),58)
scene.render.engine='CYCLES';scene.cycles.device='CPU'
scene['boundary']='Presentation shell only: exact solver axes plus illustrative same-diameter lower joint bays and weld beads. No new coupled solve.'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'native-fabrication-source.blend'))
record={'blenderVersion':bpy.app.version_string,'source':str(ROOT/'src/beso/NativePlatformV5.ts'),'sourceSHA256':hashlib.sha256((ROOT/'src/beso/NativePlatformV5.ts').read_bytes()).hexdigest(),'nativeModelSHA256':hashlib.sha256((ROOT/'public/beso-research/physics/native-model.json').read_bytes()).hexdigest(),'meshes':len(payload['meshes']),'vertices':vertex_count,'GPUUsed':False,'rendered':False,'boundary':scene['boundary']}
(OUT/'blender-geometry-provenance.json').write_text(json.dumps(record,ensure_ascii=False,indent=2))
print(json.dumps(record,ensure_ascii=False))
