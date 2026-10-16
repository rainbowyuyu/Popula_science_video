"""Cycles ray-traced AO atlases, retaining every GLB transform and animation pivot.
Actual ray queries in Cycles ShaderNodeAmbientOcclusion; not screen-space AO.
The main movie remains hybrid WebGPU, not fully path traced.
"""
import bpy, json, math, hashlib, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/v8'; OUT.mkdir(parents=True,exist_ok=True)
WORK=ROOT/'work/v8/lighting'; WORK.mkdir(parents=True,exist_ok=True)
t0=time.time()
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/turbine.glb'),loglevel=40)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU'
scene.render.bake.use_clear=False;scene.render.bake.margin=12
original=[o for o in bpy.context.scene.objects if o.type=='MESH']
roots=[o for o in bpy.context.scene.objects if o.type=='EMPTY']
def exterior(o):
    n=o.name
    if n.startswith(('NacelleShell','TowerShell','Blade_','HubSpinner')):return True
    p=o.parent
    while p:
        if p.name in ('TowerAssembly','Blades','Hub'):return True
        p=p.parent
    return False
buckets={'outer': [o for o in original if exterior(o)],'mechanism':[o for o in original if not exterior(o)]}
manifest={'engine':'Cycles','bake':'EMIT from ray-traced Ambient Occlusion node',
 'samples':64,'aoNodeSamples':64,'localOptixDevices':[d.name for d in prefs.devices if d.use],
 'inputSha256':hashlib.sha256((ROOT/'public/models/turbine.glb').read_bytes()).hexdigest(),
 'scope':'Near-field contact occlusion of rigid assemblies. Direct sun and water are WebGPU.', 'buckets':[]}
for bucket,objects in buckets.items():
    print('BAKE_BUCKET',bucket,len(objects),flush=True)
    for o in original:o.hide_render=True;o.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
        # Mesh users can share vertices but UV islands must remain independent.
        o.data=o.data.copy()
        uv=o.data.uv_layers.new(name='RayAO')
        o.data.uv_layers.active=uv;uv.active_render=True
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62),island_margin=.004,area_weight=.7,correct_aspect=True,scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # A single proxy keeps BVH build and bake dispatch bounded (882 nodes -> 2).
    bpy.ops.object.duplicate(linked=False)
    copies=list(bpy.context.selected_objects)
    for c in copies:c.hide_render=False
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join();proxy=bpy.context.object;proxy.name='CyclesBakeProxy_'+bucket
    # Joining leaves authored world positions intact; originals retain their hierarchy.
    image=bpy.data.images.new('Turbine_'+bucket+'_RayAO',width=4096 if bucket=='mechanism' else 2048,height=4096 if bucket=='mechanism' else 2048,alpha=False)
    image.generated_color=(1,1,1,1);image.colorspace_settings.name='Non-Color'
    bake=bpy.data.materials.new('RayAO_'+bucket);bake.use_nodes=True
    nt=bake.node_tree;nt.nodes.clear();output=nt.nodes.new('ShaderNodeOutputMaterial')
    ao=nt.nodes.new('ShaderNodeAmbientOcclusion');ao.samples=64;ao.inputs['Distance'].default_value=1.35 if bucket=='mechanism' else 2.0
    ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.24,.24,.24,1);ramp.color_ramp.elements[1].color=(1,1,1,1)
    emit=nt.nodes.new('ShaderNodeEmission');nt.links.new(ao.outputs['AO'],ramp.inputs[0]);nt.links.new(ramp.outputs['Color'],emit.inputs['Color']);nt.links.new(emit.outputs[0],output.inputs['Surface'])
    target=nt.nodes.new('ShaderNodeTexImage');target.image=image;nt.nodes.active=target
    proxy.data.materials.clear();proxy.data.materials.append(bake)
    for p in proxy.data.polygons:p.material_index=0
    bpy.ops.object.bake(type='EMIT',use_clear=False,margin=12)
    image.filepath_raw=str(OUT/(bucket+'-ray-ao.png'));image.file_format='PNG';image.save()
    # Exporter recognizes this glTF OCclusion socket and UVMap.
    ng=bpy.data.node_groups.get('glTF Material Output')
    if ng is None:
        ng=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');ng.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    mats={}
    for o in objects:
        for i,slot in enumerate(o.material_slots):
            src=slot.material
            if src is None:continue
            if src.name not in mats:
                m=src.copy();m.name=src.name+'_RayAO_'+bucket;mats[src.name]=m
                n=m.node_tree.nodes;l=m.node_tree.links
                uvn=n.new('ShaderNodeUVMap');uvn.uv_map='RayAO'
                im=n.new('ShaderNodeTexImage');im.image=image;l.new(uvn.outputs[0],im.inputs[0])
                gl=n.new('ShaderNodeGroup');gl.node_tree=ng;l.new(im.outputs['Color'],gl.inputs['Occlusion'])
            o.data.materials[i]=mats[src.name]
        # Keep original texture coordinate zero. RayAO is exported as its own channel.
        o.data.uv_layers.active_index=0
    bpy.data.objects.remove(proxy,do_unlink=True)
    manifest['buckets'].append({'name':bucket,'objects':len(objects),'resolution':image.size[:],'texture':image.filepath_raw,'sha256':hashlib.sha256(Path(image.filepath_raw).read_bytes()).hexdigest()})
    print('BUCKET_DONE',bucket,round(time.time()-t0,1),flush=True)
for o in original:o.hide_render=False
bpy.ops.object.select_all(action='DESELECT')
for o in original+roots:o.select_set(True)
bpy.context.view_layer.objects.active=roots[0]
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'turbine-rayao-v8.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'turbine-rayao.glb'),export_format='GLB',export_yup=True,use_selection=True,export_cameras=False,export_lights=False)
manifest['outputSha256']=hashlib.sha256((OUT/'turbine-rayao.glb').read_bytes()).hexdigest();manifest['wallSeconds']=time.time()-t0
(WORK/'bake-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('RAYAO_OK',manifest['outputSha256'],flush=True)
