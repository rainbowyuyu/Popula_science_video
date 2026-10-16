"""Blender-authored soft, granular soil rim. Illustrative strata, no solver values."""
import bpy,bmesh,math,json,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from datetime import datetime,timezone
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];OUT=ROOT/'public/v16'
TEX=HERE/'soil-textures';TEX.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.56,.65,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
colors=[(.49,.46,.40),(.39,.38,.35),(.48,.46,.42),(.42,.45,.45),(.49,.48,.43)]
depths=[0,8,24,37,64,84];names=['Top_fill_schematic','Soft_clay_schematic','Silty_clay_schematic','Fine_silt_schematic','Dense_silt_schematic']
rng=np.random.default_rng(160011);n=512
y,x=np.mgrid[0:n,0:n]/n
noise=rng.normal(0,1,(n,n))
def smooth_noise(count):
    grid=rng.normal(0,1,(count+1,count+1));grid[-1,:]=grid[0,:];grid[:,-1]=grid[:,0]
    px=x*count;py=y*count;ix=px.astype(int);iy=py.astype(int);fx=px-ix;fy=py-iy
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    return (grid[iy,ix]*(1-fx)+grid[iy,ix+1]*fx)*(1-fy)+(grid[iy+1,ix]*(1-fx)+grid[iy+1,ix+1]*fx)*fy
fine=smooth_noise(64)
coarse=smooth_noise(7)*.010+smooth_noise(23)*.006
lamina=np.sin((y+.008*np.sin(x*5*math.pi))*55*math.pi)*.004
mesh_objects=[]
def material(index):
    base=np.array(colors[index]);grain=(noise*.013+fine*.009+lamina+coarse)[...,None]
    rgba=np.ones((n,n,4),dtype=np.float32);rgba[:,:,:3]=np.clip(base[None,None,:]+grain,.02,.95)
    image=bpy.data.images.new(f'Soil_{index+1}_grain_color',width=n,height=n);image.pixels.foreach_set(rgba.ravel());image.filepath_raw=str(TEX/f'soil-{index+1}-color.png');image.file_format='PNG';image.save();image.pack()
    mat=bpy.data.materials.new(f'V16_Soil_{index+1}_Matte');mat.use_nodes=True;sh=mat.node_tree.nodes['Principled BSDF'];sh.inputs['Roughness'].default_value=.92
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT';mat.node_tree.links.new(tex.outputs['Color'],sh.inputs['Base Color'])
    return mat
def boundary(index,angle,r):
    if index in [0,5]:return -depths[index]
    return -depths[index]+.4*math.sin(angle*3+index*.8)+.16*math.sin(r*.16+angle*5)
N=128
for layer in range(5):
    verts=[]
    for level in [layer,layer+1]:
        for r in [60.5,95]:
            for i in range(N+1):
                a=math.pi*i/N;verts.append((r*math.cos(a),r*math.sin(a),boundary(level,a,r)))
    aN=N+1;faces=[]
    for i in range(N):
        ti=i;to=aN+i;bi=2*aN+i;bo=3*aN+i
        faces.extend([(ti,ti+1,to+1,to),(bi,bo,bo+1,bi+1),(ti,bi,bi+1,ti+1),(to,to+1,bo+1,bo)])
    faces.extend([(0,aN,3*aN,2*aN),(N,2*aN+N,3*aN+N,aN+N)])
    mesh=bpy.data.meshes.new(names[layer]+'_mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    uv=mesh.uv_layers.new(name='Soil_grain_uv')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co
            if abs(poly.normal.z)>.7:uv.data[li].uv=(v.x/12,v.y/12)
            else:uv.data[li].uv=((v.x+v.y)/15,v.z/12)
    ob=bpy.data.objects.new(names[layer],mesh);scene.collection.objects.link(ob);ob.data.materials.append(material(layer));ob['dataMode']='illustrative';ob['strata']='generic visual layers, not site borehole log';mesh_objects.append(ob)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for o in mesh_objects:o.select_set(True)
bpy.context.view_layer.objects.active=mesh_objects[0]
dest=OUT/'soil-cutaway-rim.glb';bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_yup=True)
try:scene.render.engine='BLENDER_EEVEE_NEXT'
except TypeError:scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
def area(name,loc,energy,size):
    ld=bpy.data.lights.new(name,'AREA');ld.energy=energy;ld.size=size;lo=bpy.data.objects.new(name,ld);scene.collection.objects.link(lo);lo.location=loc;lo.rotation_euler=(Vector((0,30,-35))-lo.location).to_track_quat('-Z','Y').to_euler()
area('Soft overcast key',(50,-80,180),350000,180);area('Soft edge fill',(-120,40,80),170000,150)
cd=bpy.data.cameras.new('V16_Soil_QA');cam=bpy.data.objects.new('V16_Soil_QA',cd);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(240,-330,195);cam.rotation_euler=(Vector((0,35,-36))-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=50
preview=HERE/'previews/soil-cutaway-rim.png';scene.render.filepath=str(preview)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'soil-cutaway-rim-v16.blend'))
bpy.ops.render.render(write_still=True)
report={'createdAt':datetime.now(timezone.utc).isoformat(),'generator':'Blender 5.1.2 local procedural','script':str(Path(__file__).relative_to(ROOT)),'dataMode':'illustrative','geologicalAccuracy':'Generic visual strata only; no site borehole stratigraphy is claimed.','asset':str(dest.relative_to(ROOT)),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size,'units':'metres','coordinateSystem':'glTF Y-up; centered on tower axis, ground Y=0, rear half Z<=0.','innerRadius_m':60.5,'outerRadius_m':95,'depth_m':84,'boundaryDepths_m':depths,'meshCount':5,'triangles':sum(len(o.data.polygons)*2 for o in mesh_objects),'textures':'5 embedded 512x512 color textures with fine grains and subtle lamination, matte PBR','normals':'Recalculated consistent outward normals per closed layer, shared layer boundaries have no gaps.','composition':'Open front half and cylindrical void; no text, forces, arrows or data colors.','preview':str(preview.relative_to(ROOT)),'blend':str((HERE/'soil-cutaway-rim-v16.blend').relative_to(ROOT))}
(HERE/'soil-cutaway-inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('V16_SOIL_ASSET_DONE',json.dumps(report,ensure_ascii=False))
