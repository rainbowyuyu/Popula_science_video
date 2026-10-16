import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / 'delivery/episode3v5/public/episode3v2/models'
OUT = ROOT / 'cover_artwork'
OUT.mkdir(parents=True, exist_ok=True)

# CLI: blender -b --python script -- ratio output.png
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
ratio = args[0] if args else '16x9'
output = Path(args[1]) if len(args)>1 else OUT/f'scene_{ratio}.png'

W,H = {'16x9':(1920,1080), '3x4':(1440,1920), '4x3':(1920,1440), '9x16':(1080,1920)}[ratio]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = W
sc.render.resolution_y = H
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.film_transparent = False
sc.render.image_settings.color_depth = '8'
# Filmic-ish neutral palette
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.0
sc.view_settings.gamma = 1.0

# Warm paper world
world = bpy.data.worlds.new('warm paper world')
world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (0.90,0.86,0.76,1)
bg.inputs['Strength'].default_value = 0.50
sc.world = world

def make_mat(name,color,rough=.45,metal=0.0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    return m
paper=make_mat('warm ivory',(0.90,0.86,0.76),.72)
ink=make_mat('ink blue',(0.035,0.075,0.08),.5)
accent=make_mat('cinnabar accent',(0.56,0.12,0.07),.36)
soft=make_mat('soft blue',(0.20,0.46,0.47),.38)

def cube(name,loc,dims,mat,bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=dims; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('soft edge','BEVEL');mod.width=bevel;mod.segments=3
    return o
# Floor and layered paper plinth
floor=cube('matte paper floor',(1,1,-0.58),(60,60,.3),paper,.12)
plinth=cube('quiet display plinth',(3.0,0,-.38),(12.2,8.0,.20),make_mat('plinth',(0.69,0.67,0.60),.62),.12)
# thin inlaid line to establish a shared table perspective
line_mat=make_mat('inlaid teal',(0.16,0.34,0.34),.4)
line=cube('inlaid line',(2.8,-3.92,-.26),(8.5,.025,.016),line_mat,.005)

# Import a GLB under an empty so the model can be scaled/placed cleanly
def import_root(filename, name, loc, scale=1.0, rot=(0,0,0)):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(MODEL_DIR/filename))
    new=set(bpy.data.objects)-before
    root=bpy.data.objects.new(name,None);sc.collection.objects.link(root)
    for o in new:
        if o.parent not in new: o.parent=root
    root.location=loc; root.scale=(scale,scale,scale); root.rotation_euler=rot
    return root

def descendants(root):
    out=[]
    def walk(o):
        out.append(o)
        for c in o.children: walk(c)
    walk(root)
    return out

def make_wind_curve(name, pts, material):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.bevel_depth=.024; cu.bevel_resolution=3
    sp=cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts)-1)
    for bp,co in zip(sp.bezier_points,pts):
        bp.co=co; bp.handle_left_type='AUTO'; bp.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,cu); sc.collection.objects.link(ob); cu.materials.append(material); return ob

def colorize_heatmap(root, center_x):
    # Muted scientific colour ramp: readable at thumbnail size while still
    # sitting comfortably inside the warm paper/wood palette.
    blue=make_mat('heatmap cool blue',(.07,.22,.38),.40)
    teal=make_mat('heatmap teal',(.08,.43,.42),.40)
    yellow=make_mat('heatmap warm yellow',(.78,.49,.12),.36)
    orange=make_mat('heatmap orange',(.76,.23,.08),.35)
    red=make_mat('heatmap hot red',(.58,.07,.045),.34)
    for o in descendants(root):
        if o.type!='MESH': continue
        n=o.name.lower()
        if any(k in n for k in ('foundation','platform','plinth','base')): mat=blue
        elif any(k in n for k in ('column','post','stone')): mat=teal
        elif any(k in n for k in ('beam','corbel','rail','step')): mat=yellow
        elif any(k in n for k in ('roof','tile','ridge','rafter','finial')): mat=red
        else: mat=orange
        o.data.materials.clear(); o.data.materials.append(mat)
    wind=make_mat('wind flow',(.12,.48,.56),.30,.02)
    # straight wind streaks: the model remains undeformed; only the flow field moves around it.
    # Keep the flow marks registered to the rigid heat-map pavilion.  The
    # pavilion itself never deforms in the cover; only the surrounding flow
    # lines suggest the wind direction.
    flow_start = center_x - (1.35 if ratio in ('3x4','9x16') else 1.85)
    flow_span = 2.90 if ratio in ('3x4','9x16') else 3.65
    for i,z in enumerate((4.05,4.75)):
        x0=flow_start
        make_wind_curve(
            f'wind streak {i}',
            [(x0,-.10,z),(x0+.82,-.10,z+.10),(x0+1.70,-.10,z-.08),(x0+flow_span,-.10,z+.03)],
            wind,
        )

# Both hero views are present in every delivery ratio: a dismantled pavilion
# on the left and a rigid, colour-coded wind response on the right.  Keeping
# the same visual grammar across ratios makes the series recognisable while
# letting the camera crop breathe for portrait formats.
split_layout = {
    '16x9': {'pav': (2.35, 1.25, 0.35), 'pav_scale': 0.38,
             'heat': (6.55, 1.35, 0.35), 'heat_scale': 0.36},
    '4x3':  {'pav': (2.35, 1.25, 0.35), 'pav_scale': 0.39,
             'heat': (6.45, 1.35, 0.35), 'heat_scale': 0.37},
    '3x4':  {'pav': (0.55, 1.25, -0.05), 'pav_scale': 0.34,
             'heat': (5.15, 1.35, -0.05), 'heat_scale': 0.32},
    '9x16': {'pav': (0.40, 1.25, -0.05), 'pav_scale': 0.31,
             'heat': (4.95, 1.35, -0.05), 'heat_scale': 0.29},
}
layout = split_layout[ratio]
pav=import_root('crafted-pavilion.glb','PAVILION_DISASSEMBLED',layout['pav'],layout['pav_scale'],(0,0,math.radians(-4)))

# The glTF importer wraps the visible stage groups one level below a
# `CraftedPavilion` empty, so iterating only pav.children leaves the model
# assembled.  Offset the stage empties themselves to create a legible,
# physically plausible exploded view without double-moving their mesh childen.
for o in descendants(pav):
    low=o.name.lower()
    if not low.startswith('stage_') or o.type != 'EMPTY':
        continue
    if low.startswith('stage_roof'):
        # Give the roof a clear breathing gap above the frame.  The offset is
        # applied to the stage empty, so all of its mesh children travel as a
        # single, believable assembly.
        o.location.z += 1.55; o.location.x -= 0.20
    elif low.startswith('stage_rafters'):
        o.location.z += 1.08; o.location.x += 0.16
    elif low.startswith('stage_beam'):
        # Four bearing levels fan out slightly in depth, making the pavilion
        # read as an exploded construction diagram rather than an intact copy.
        try:
            idx = int(low.rsplit('_', 1)[-1])
        except ValueError:
            idx = 0
        o.location.z += 0.56 + idx * 0.08
        o.location.y += (idx - 1.5) * 0.06
    elif low.startswith('stage_rails'):
        o.location.z += 0.34; o.location.x += 0.08

heat=import_root('crafted-pavilion.glb','PAVILION_WIND_HEATMAP',layout['heat'],layout['heat_scale'],(0,0,math.radians(4)))
colorize_heatmap(heat, layout['heat'][0])
# Three actual teaching joints in front, each angled like an object on a workbench
# Front hero (dovetail) is closest and largest; the others step back in depth.
if ratio == '9x16':
    dpos,hpos,ppos=(1.90,-2.62,-0.95),(4.02,-2.64,-0.44),(6.22,-1.98,.14)
elif ratio == '3x4':
    dpos,hpos,ppos=(0.95,-2.62,-0.95),(3.65,-2.64,-0.44),(6.18,-1.98,.14)
else:
    dpos,hpos,ppos=(-0.10,-2.62,-0.95),(3.35,-2.64,-0.44),(6.60,-1.98,.14)
joint_scale = .58 if ratio in ('3x4','9x16') else .68
dov=import_root('dovetail.glb','JOINT_DOVETAIL',dpos,joint_scale,(math.radians(6),math.radians(-8),math.radians(-14)))
half=import_root('half-lap.glb','JOINT_HALF_LAP',hpos,.40 if ratio in ('3x4','9x16') else .42,(math.radians(-4),math.radians(9),math.radians(17)))
peg=import_root('pegged.glb','JOINT_PEGGED',ppos,.38 if ratio in ('3x4','9x16') else .40,(math.radians(4),math.radians(-7),math.radians(-18)))
# Small brass discs beneath joints separate them from the plinth without looking like UI panels.
brass=make_mat('aged brass',(0.52,0.27,0.07),.30,0.18)
for i,(x,y,s) in enumerate([(dpos[0],dpos[1],1.1),(hpos[0],hpos[1],1.15),(ppos[0],ppos[1],.9)]):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=s,depth=.05,location=(x,y,-.21));bpy.context.object.data.materials.append(brass)

# Soft directional lights, one cooler rim to separate wood from paper.
def area(name,loc,energy,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((3,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler();return o
area('large softbox',(-5,-8,12),1350,7.0,(1.0,.82,.62))
area('cool edge',(10,3,10),1700,5.0,(.55,.8,.78))
area('front fill',(2,-10,5),900,6.0,(1.0,.92,.80))
# Gentle contact shadow under each assembly
for x,y,r in [(0,-2.55,1.5),(4.1,-2.62,1.6),(6.6,-1.92,1.3)]:
    bpy.ops.mesh.primitive_circle_add(vertices=64,radius=r,fill_type='TRIFAN',location=(x,y,-.215));o=bpy.context.object;o.name='shadow_disc';o.scale=(1,.62,1);o.data.materials.append(make_mat(f'shadow{x}',(0.12,0.10,0.07),.95))
    # hide solid look with low alpha material
    m=o.data.materials[0];bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.12,.10,.07,1);bs.inputs['Alpha'].default_value=.10;bs.inputs['Roughness'].default_value=1.0

# Camera — horizontal keeps the two hero views side-by-side; portrait keeps
# a generous title-safe band above while retaining both views and joints.
if ratio in ('16x9','4x3'):
    cam_data=bpy.data.cameras.new('CoverCamera'); cam=bpy.data.objects.new('CoverCamera',cam_data);sc.collection.objects.link(cam)
    cam.location=(11.4,-19.5,10.0); target=Vector((3.85,-.10,1.55)); cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler();cam_data.lens=56;cam_data.sensor_width=36
else:
    cam_data=bpy.data.cameras.new('CoverCamera'); cam=bpy.data.objects.new('CoverCamera',cam_data);sc.collection.objects.link(cam)
    cam.location=(10.8,-19.0,12.3); target=Vector((3.15,-.25,1.45)); cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler();cam_data.lens=54;cam_data.sensor_width=32
sc.camera=cam
# Depth-of-field: enough separation without losing structure legibility.
cam_data.dof.use_dof=True; cam_data.dof.focus_object=dov; cam_data.dof.aperture_fstop=6.3; cam_data.dof.aperture_blades=6
# Set output and save source scene for inspection.
sc.render.filepath=str(output)
sc.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'joinery_cover_{ratio}.blend'))
bpy.ops.render.render(write_still=True)
print('RENDERED',ratio,output)




