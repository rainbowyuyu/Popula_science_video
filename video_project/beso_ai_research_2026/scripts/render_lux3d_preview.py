import bpy, math
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'D:/python_project/manim_extend_rainbow/video_project/beso_ai_research_2026/public/assets/lux3d.glb')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:
    o.select_set(True)
    o.rotation_euler=(0,0,math.radians(12))
    o.select_set(False)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
bpy.ops.object.select_all(action='DESELECT')
mins=Vector((1e9,1e9,1e9)); maxs=Vector((-1e9,-1e9,-1e9))
for o in meshes:
    for c in o.bound_box:
        p=o.matrix_world @ Vector(c)
        mins.x=min(mins.x,p.x); mins.y=min(mins.y,p.y); mins.z=min(mins.z,p.z)
        maxs.x=max(maxs.x,p.x); maxs.y=max(maxs.y,p.y); maxs.z=max(maxs.z,p.z)
center=(mins+maxs)/2; extent=max(maxs-mins)
for o in meshes: o.location-=center
world=bpy.context.scene.world or bpy.data.worlds.new('Launch World')
bpy.context.scene.world=world
world.color=(0.025,0.08,0.11)
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.018,0.075,0.10,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.72
bpy.ops.object.light_add(type='AREA', location=(extent*.8,extent*.9,extent*.7)); key=bpy.context.object; key.data.energy=12000; key.data.shape='DISK'; key.data.size=extent*.65
bpy.ops.object.light_add(type='AREA', location=(-extent*.7,extent*.4,-extent*.5)); fill=bpy.context.object; fill.data.energy=6000; fill.data.color=(0.24,0.75,0.82); fill.data.size=extent*.8
bpy.ops.object.light_add(type='AREA', location=(0,-extent*.3,extent*.7)); rim=bpy.context.object; rim.data.energy=9000; rim.data.color=(1.0,.55,.28); rim.data.size=extent*.5
bpy.ops.object.camera_add(location=(extent*1.42,extent*.88,extent*1.35)); cam=bpy.context.object
direction=Vector((0,0,0))-cam.location; cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler(); cam.data.lens=52
bpy.context.scene.camera=cam
scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=1280; scene.render.resolution_y=720; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=r'D:/python_project/manim_extend_rainbow/video_project/beso_ai_research_2026/public/assets/lux3d-preview.png'
scene.render.film_transparent=False
scene.view_settings.look='AgX - Medium High Contrast'; scene.view_settings.exposure=1.7
bpy.ops.wm.save_as_mainfile(filepath=r'D:/python_project/manim_extend_rainbow/video_project/beso_ai_research_2026/public/assets/lux3d-preview.blend')
bpy.ops.render.render(write_still=True)
