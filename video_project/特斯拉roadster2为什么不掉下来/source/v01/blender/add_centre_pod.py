"""Add one missing teaching pod; preserve original body/model and old exports.
Run with --background --factory-startup. Does not load user addons.
"""
from pathlib import Path
import bpy,json,hashlib
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/v03';OUT.mkdir(parents=True,exist_ok=True)
assert not (OUT/'teaching-car.blend').exists(),'New model already exists'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/v01/teaching-car.blend'))
source=next(o for o in bpy.context.scene.objects if o.name.startswith('Teaching nozzle pod'))
pod=source.copy();pod.data=source.data.copy();pod.name='Teaching centre nozzle pod';bpy.context.collection.objects.link(pod);pod.location.y=0
# Export exactly the same body coordinates as v01, adding only the central pod.
deps=bpy.context.evaluated_depsgraph_get();objects=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH':continue
    ev=obj.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();pos=[];norm=[]
    for tri in me.loop_triangles:
        for vi in tri.vertices:
            v=me.vertices[vi];p=ev.matrix_world@v.co;n=(ev.matrix_world.to_3x3().inverted().transposed()@v.normal).normalized()
            pos.extend(p);norm.extend(n)
    mat=obj.data.materials[0];bs=mat.node_tree.nodes.get('Principled BSDF')
    objects.append({'name':obj.name,'positions':pos,'normals':norm,'color':list(mat.diffuse_color)[:3],'metalness':float(bs.inputs['Metallic'].default_value),'roughness':float(bs.inputs['Roughness'].default_value),'emissiveStrength':float(bs.inputs['Emission Strength'].default_value)})
    ev.to_mesh_clear()
mesh=OUT/'teaching-car.mesh.json'
mesh.write_text(json.dumps({'coordinateSystem':'x-forward/y-left/z-up','origin':'assumed teaching centre of mass','units':'m','notTeslaCAD':True,'objects':objects},separators=(',',':')),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'teaching-car.blend'))
manifest={'sha256':hashlib.sha256(mesh.read_bytes()).hexdigest(),'meshCount':len(objects),'base':'assets/v01/teaching-car.blend','onlyChange':'duplicated one existing pod at y=0, same materials; no body regeneration','notTeslaCAD':True}
(OUT/'model-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('MODEL_PATCH_OK',len(objects),'meshes')
