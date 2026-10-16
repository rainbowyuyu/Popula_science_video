import bpy, math
from mathutils import Vector
from pathlib import Path
R=Path(r'D:/python_project/manim_extend_rainbow/video_project/episode3'); OUT=R/'blender'; OUT.mkdir(exist_ok=True)
def clear(): bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,color,rough=.5,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True; bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal; return m
def cube(name,loc,scale,ma,bevel=.03):
 bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object;o.name=name;o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(ma)
 if bevel:
  mod=o.modifiers.new('soft edges','BEVEL');mod.width=bevel;mod.segments=3
 return o
def setup(world=(0.035,0.055,0.06)):
 sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.render.resolution_x=1280;sc.render.resolution_y=720;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
 sc.world=bpy.data.worlds.new('World'); sc.world.color=world; sc.world.use_nodes=True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value=(*world,1);sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
 for loc,energy,size,color in [((-4,10,12),3200,7,(1,.73,.48)),((8,7,8),2600,6,(.55,.72,1)),((0,14,-4),1800,5,(1,.88,.7))]:
  d=bpy.data.lights.new('soft key','AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new('light',d);o.location=loc;sc.collection.objects.link(o)
 floor=mat('stone',(0.16,.18,.18),.76);cube('stone platform',(0,0,0),(4.4,.18,3.5),floor,.12)
def camera(loc,target,lens=48):
 d=bpy.data.cameras.new('Camera');c=bpy.data.objects.new('Camera',d);bpy.context.scene.collection.objects.link(c);bpy.context.scene.camera=c;c.location=loc;c.data.lens=lens; q=(Vector(target)-c.location).to_track_quat('-Z','Y');c.rotation_euler=q.to_euler();return c
# hero
clear();setup((.12,.16,.18));bpy.ops.import_scene.gltf(filepath=str(R/'lux3d/pavilion_glb.glb')); hero=bpy.context.selected_objects[0] if bpy.context.selected_objects else bpy.context.scene.objects[-1]; hero.name='Lux3D_Pavilion_Hero';hero.scale=(2.3,2.3,2.3);hero.location=(0,.55,0);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bpy.context.scene.camera=camera((25,16,30),(0,3.2,0),52);bpy.context.scene.render.filepath=str(OUT/'pavilion-assembled.png');bpy.ops.render.render(write_still=True)
# exploded joinery
clear();setup((.055,.04,.025));wood=mat('walnut',(.30,.12,.045),.38);wood2=mat('fresh cut',(.62,.34,.14),.5);stone=mat('paper',(.55,.45,.32),.8)
cube('post',(0,1.8,0),(1.0,1.8,1.0),wood,.08);cube('beam',(2.15,1.8,0), (2.1,.55,.55),wood,.08);cube('tenon',(1.05,1.8,0),(.72,.32,.32),wood2,.04);cube('shoulder',(1.5,1.8,0),(.22,.78,.72),wood2,.04)
# joint reference mesh as subtle foreground
bpy.ops.import_scene.gltf(filepath=str(R/'lux3d/joint_glb.glb')); j=bpy.context.selected_objects[0] if bpy.context.selected_objects else bpy.context.scene.objects[-1];j.name='Lux3D_Joint_Reference';j.scale=(6,6,6);j.location=(0,.3,1.4)
bpy.context.scene.camera=camera((7,4.2,8.2),(0,1.8,0),55);bpy.context.scene.render.filepath=str(OUT/'joint-exploded.png');bpy.ops.render.render(write_still=True)
# cutaway joint on warm paper
clear();setup((.88,.83,.72));wood=mat('cut walnut',(.34,.16,.06),.42);cut=mat('cut face',(.72,.43,.2),.55);cube('post',(0,1.8,0),(1.0,1.8,1),wood,.06);cube('beam',(2.05,1.8,0),(2.0,.55,.55),wood,.06);cube('tenon',(1.0,1.8,0),(.75,.30,.30),cut,.03);bpy.context.scene.camera=camera((6,3.7,7),(0,1.7,0),55);bpy.context.scene.render.filepath=str(OUT/'joint-cutaway.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'îͤ_assembly.blend'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'joinery_pavilion_assembly.blend'))
