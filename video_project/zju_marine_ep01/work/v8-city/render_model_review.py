import bpy,math,os
from mathutils import Vector
root=r'C:/Users/zju/Videos/rainbow-marine-ep01-v8/model-review'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=root+'/semisub-v8.obj',forward_axis='NEGATIVE_Z',up_axis='Y')
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':
  for p in ob.data.polygons:p.use_smooth=True
bpy.ops.mesh.primitive_plane_add(size=600,location=(0,0,-21.15));floor=bpy.context.object;floor.name='ReviewFloor';mat=bpy.data.materials.new('ReviewFloor');mat.diffuse_color=(.27,.31,.33,1);floor.data.materials.append(mat)
world=bpy.data.worlds.new('Soft studio') if not bpy.data.worlds else bpy.data.worlds[0];bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.62,.70,.78,1);world.node_tree.nodes['Background'].inputs[1].default_value=.42
for name,location,power,size in [('Key',(40,-60,100),150000,65),('Fill',(-80,-25,50),80000,55),('Rim',(15,75,80),130000,50)]:
 bpy.ops.object.light_add(type='AREA',location=location);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,-4))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(112,-150,115));cam=bpy.context.object;cam.rotation_euler=(Vector((5,0,-5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=145;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=root+'/semisub-v8-review.png';bpy.ops.wm.save_as_mainfile(filepath=root+'/semisub-v8-review.blend');bpy.ops.render.render(write_still=True)
