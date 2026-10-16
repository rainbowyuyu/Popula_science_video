import bpy, json, math, os, sys
from mathutils import Vector

BASE = r'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\delivery\episode3\covers_v6'
SOURCE = os.path.join(BASE, 'pavilion-cover-source.blend')
MANIFEST = os.path.join(BASE, 'cover-render-manifest.json')
with open(MANIFEST, encoding='utf-8') as f:
    manifest = json.load(f)
ratios = {'4x3': 1.06, '9x16': 1.16}
for ratio, factor in ratios.items():
    # fresh source per ratio: this script is executed once and resets file by re-opening
    bpy.ops.wm.open_mainfile(filepath=SOURCE)
    entry = next(x for x in manifest['renders'] if x['ratio']==ratio)
    scene = bpy.context.scene
    scene.render.resolution_percentage = 100
    scene.render.resolution_x, scene.render.resolution_y = entry['size']
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False
    cam = bpy.data.objects.get('Cover Camera') or scene.camera
    scene.camera = cam
    cam.location = Vector(entry['camera']['location'])
    target = Vector(entry['camera']['target'])
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z','Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = entry['camera']['ortho_scale'] * factor
    # Apply the recorded explosion offsets to the un-exploded source model.
    for name, delta in entry['offsets_blender'].items():
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.location += Vector(delta)
    for name in entry.get('hidden_roof_tiles', []):
        obj=bpy.data.objects.get(name)
        if obj: obj.hide_render=True
    deck=entry.get('occlusion_deck')
    if deck:
        obj=bpy.data.objects.get(deck)
        if obj: obj.hide_render=True
    # Keep all four foundations and columns visible; only roof tiles/deck are intentionally occluded.
    out=os.path.join(BASE, f'scene_{ratio}_safe.png')
    scene.render.filepath=out
    bpy.ops.render.render(write_still=True)
    print('RENDERED', ratio, out, 'ortho', cam.data.ortho_scale)
