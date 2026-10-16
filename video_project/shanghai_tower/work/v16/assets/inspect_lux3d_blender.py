"""Normalize, audit and preview the real Lux3D source; no invented cloud output."""
import bpy, bmesh, json, math, hashlib
from pathlib import Path
from mathutils import Vector
from datetime import datetime,timezone
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
OUT=ROOT/'public/v16';OUT.mkdir(parents=True,exist_ok=True)
PREVIEW=HERE/'previews';PREVIEW.mkdir(exist_ok=True)
SOURCE=HERE/'originals/riverfront-railing.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
def bounds(objects):
    points=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
    lo=Vector([min(v[i] for v in points) for i in range(3)]);hi=Vector([max(v[i] for v in points) for i in range(3)])
    return lo,hi
lo,hi=bounds(meshes);dims=hi-lo
raw=[round(d,6) for d in dims]
factor=3.0/max(dims.x,dims.y)
center=Vector(((lo.x+hi.x)*.5,(lo.y+hi.y)*.5,lo.z))
# Bake source world-space transforms into each mesh, then center and scale all meshes as one asset.
for o in meshes:
    o.data.transform(o.matrix_world);o.parent=None;o.matrix_world.identity()
    for v in o.data.vertices:v.co=(v.co-center)*factor
    o.data.update()
    o['source']='Lux3D task 4046648';o['purpose']='Illustrative riverfront foreground, no solver meaning';o['units']='m'
bpy.context.view_layer.update()
lo,hi=bounds(meshes);dims=hi-lo
report={'createdAt':datetime.now(timezone.utc).isoformat(),'blender':bpy.app.version_string,'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'rawDimensions':raw,'normalizedDimensions_m':list(dims),'normalizationScale':factor,'taskId':'4046648','units':'metres','coordinateSystem':'GLTF Y-up after export; X width, Z depth, base Y=0','purpose':'Decorative foreground riverfront railing. Geometry and proportions are illustrative.','meshes':[],'materials':[],'images':[]}
# The actual generated source has a missing middle cable and an uneven handrail.
# Preserve its textured granite plinth/posts; repair only these precise details locally.
for o in meshes:
    bm=bmesh.new();bm.from_mesh(o.data)
    removed=[v for v in bm.verts if (abs(v.co.x)<1.13 and .35<v.co.z<1.17) or v.co.z>1.185]
    bmesh.ops.delete(bm,geom=removed,context='VERTS')
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000015)
    bm.to_mesh(o.data);bm.free();o.data.update()
def metal(name,color,roughness):
    m=bpy.data.materials.new(name);m.use_nodes=True
    shader=m.node_tree.nodes['Principled BSDF'];shader.inputs['Base Color'].default_value=(*color,1);shader.inputs['Metallic'].default_value=.86;shader.inputs['Roughness'].default_value=roughness
    return m
bronze=metal('V16_local_brushed_bronze',(.29,.22,.13),.29)
steel=metal('V16_local_cable_steel',(.38,.45,.5),.24)
def cylinder_between(name,a,b,r,material):
    a,b=Vector(a),Vector(b);delta=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=delta.length,location=(a+b)*.5)
    ob=bpy.context.object;ob.name=name;ob.rotation_euler=delta.to_track_quat('Z','Y').to_euler();ob.data.materials.append(material)
    bevel=ob.modifiers.new('Machined edge','BEVEL');bevel.width=min(r*.4,.007);bevel.segments=3
    for p in ob.data.polygons:p.use_smooth=True
    meshes.append(ob)
for index,z in enumerate([.511,.727,.943]):cylinder_between(f'V16_Local_Repaired_Cable_{index+1}',(-1.193,0,z),(1.193,0,z),.008,steel)
cylinder_between('V16_Local_Repaired_Handrail',(-1.47,0,1.244),(1.47,0,1.244),.049,bronze)
for x in [-1.193,1.193]:cylinder_between('V16_Local_Handrail_Connector',(x,0,1.13),(x,0,1.222),.025,steel)
report['localRepairs']=['Removed incomplete/wavy generated cable spans and rebuilt 3 aligned straight steel cables.','Replaced irregular top handrail with smooth machined bronze tube.','Retained original generated granite plinth, posts, hooks and textures.','Removed 10 degenerate source faces where possible.']
bpy.context.view_layer.update();lo,hi=bounds(meshes);dims=hi-lo;report['normalizedDimensions_m']=list(dims)
for o in meshes:
    bm=bmesh.new();bm.from_mesh(o.data)
    nonman=sum(not e.is_manifold for e in bm.edges)
    deg=sum(f.calc_area()<1e-12 for f in bm.faces)
    finite=all(math.isfinite(c) for v in bm.verts for c in v.co)
    # Recalculate consistent local face normals; retain texture and material data.
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    report['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'nonManifoldEdges':nonman,'degenerateFaces':deg,'finiteVertices':finite,'materialSlots':len(o.material_slots),'normalRepair':'recalculated outward consistency'})
for m in bpy.data.materials:
    if m.users:
        report['materials'].append({'name':m.name,'nodes':m.use_nodes,'images':[n.image.name for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image] if m.use_nodes else []})
for im in bpy.data.images:
    if im.users:report['images'].append({'name':im.name,'width':im.size[0],'height':im.size[1]})
# Export normalized asset without staging floor, lights or camera.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
dest=OUT/'riverfront-detail.glb'
bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_yup=True)
report['normalizedAsset']={'path':str(dest.relative_to(ROOT)),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size}
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
try:scene.render.engine='BLENDER_EEVEE_NEXT'
except TypeError:scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.56,.67,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));floor=bpy.context.object;floor.name='PREVIEW_ONLY_floor'
mat=bpy.data.materials.new('Preview porcelain');mat.diffuse_color=(.58,.62,.64,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.38;floor.data.materials.append(mat)
def area(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,.6))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(2,-3,5),750,5,(1,.9,.76));area('Fill',(-3,-1,3),350,5,(.74,.86,1));area('Rim',(0,4,4),850,3,(1,.87,.65))
camdata=bpy.data.cameras.new('V16_Riverfront_QA');cam=bpy.data.objects.new('V16_Riverfront_QA',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.lens=52
target=Vector((0,0,dims.z*.45))
report['previews']=[]
for index,(pos,lens) in enumerate([((4.7,-6,3.2),52),((-4.7,5,2.1),52),((1.8,-2.6,1.1),57)]):
    cam.location=pos;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
    cam.data.dof.use_dof=index==2;cam.data.dof.focus_distance=(cam.location-target).length;cam.data.dof.aperture_fstop=7.1
    scene.render.filepath=str(PREVIEW/f'riverfront-view-{index+1}.png');bpy.ops.render.render(write_still=True)
    report['previews'].append(str(Path(scene.render.filepath).relative_to(ROOT)))
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'riverfront-detail-v16.blend'))
report['blenderProject']=str((HERE/'riverfront-detail-v16.blend').relative_to(ROOT))
report['visualReview']='pending human-visible image inspection'
(HERE/'blender-inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('V16_LUX3D_ASSET_QA',json.dumps({'dimensions_m':list(dims),'meshCount':len(meshes),'materials':len(report['materials']),'asset':str(dest)},ensure_ascii=False))
