
from __future__ import annotations
import bpy, json, math, sys, shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
MODEL = ROOT.parent / 'episode3' / 'blender' / 'v7' / 'pavilion-v7.blend'
MANIFEST = ROOT / 'research' / 'episode3v7' / 'pavilion-manifest.json'
OUT = ROOT / 'delivery' / 'episode3' / 'covers_v5'
OUT.mkdir(parents=True, exist_ok=True)

SPECS = {
  '16x9': {'size':(1920,1080), 'scale':14.2, 'target':(0.0,0.0,3.6), 'cam':(11,-16,10), 'subject_shift':(2.2,1.4,0.0), 'level':0.72},
  '4x3':  {'size':(1920,1440), 'scale':12.5, 'target':(0.0,0.0,3.8), 'cam':(11,-16,10), 'subject_shift':(2.25,1.45,0.0), 'level':0.64},
  '3x4':  {'size':(1440,1920), 'scale':11.4, 'target':(0.0,0.0,3.35), 'cam':(10,-15,11), 'subject_shift':(0.0,0.0,0.0), 'level':0.76},
  '9x16': {'size':(1080,1920), 'scale':12.0, 'target':(0.0,0.0,3.35), 'cam':(10,-15,11), 'subject_shift':(0.0,0.0,0.0), 'level':0.86},
}

# Visual grouping follows the real manifest hierarchy, not the former toy scene.
def offset_for(p, obj, level, ratio):
    pid=p['id']; parent=p.get('parent',''); role=p.get('role','')
    c=obj.location.copy()
    xy=Vector((c.x,c.y,0)); radial=xy.normalized() if xy.length>0.15 else Vector((0,0,0))
    # side sign from the authored location, preserving real assembly orientation
    sgnx=1 if c.x>=0 else -1; sgny=1 if c.y>=0 else -1
    # Base and posts remain legible; the upper structure opens by construction order.
    if pid in {'PLINTH','STONE_FL','STONE_FR','STONE_BL','STONE_BR'}:
        return Vector((0,0,0))
    if pid.startswith('POST_'):
        return radial * (0.28*level)
    if parent in {'BENT_FRONT','BENT_BACK'} or pid in {'CROSS_FRONT','CROSS_BACK','LONG_LEFT','LONG_RIGHT'}:
        y = (-0.98 if parent=='BENT_FRONT' or pid=='CROSS_FRONT' else 0.98 if parent=='BENT_BACK' or pid=='CROSS_BACK' else 0.0) * level
        x = (0.30*sgnx if pid.startswith('LONG_') else 0.0) * level
        return Vector((x,y,0.08*level))
    if parent in {'BRACES','BRACE'} or pid.startswith('BRACE_'):
        return radial*(0.36*level) + Vector((0,0,-0.30*level))
    if pid.startswith('PEG_'):
        # Pins visibly leave their real holes along their authored orientation.
        if pid.startswith('PEG_X_'): return Vector((0.0, 0.70*level, 0.0))
        return Vector((0.70*level, 0.0, 0.0))
    if parent=='BRACKETS' or pid.startswith(('DOU_','GONG_','CAP_')):
        z={'DOU_':0.30,'GONG_X_':0.47,'GONG_Y_':0.58,'CAP_':0.70}.get(next((k for k in ('DOU_','GONG_X_','GONG_Y_','CAP_') if pid.startswith(k)),''),0.4)
        return radial*(0.32*level) + Vector((0,0,z*level))
    if parent=='PURLINS' or pid.startswith('PURLIN_'):
        return radial*(0.24*level) + Vector((0,0,0.82*level))
    if parent=='ROOF_SUPPORT' or pid in {'SUPPORT_X','SUPPORT_Y','CENTRE_POST','HUB'}:
        return radial*(0.25*level) + Vector((0,0,0.98*level))
    if pid.startswith('HIP_'):
        return Vector((0.52*sgnx*level,0.52*sgny*level,1.14*level))
    if pid.startswith('RAF_'):
        return radial*(0.13*level) + Vector((0,0,1.44*level))
    if pid.startswith('DECK_'):
        ang={'FRONT':0,'RIGHT':math.pi/2,'BACK':math.pi,'LEFT':3*math.pi/2}.get(pid.split('_')[1],0)
        return Vector((math.sin(ang)*0.62*level,-math.cos(ang)*0.62*level,1.76*level))
    if pid.startswith('TILE_'):
        ang={'FRONT':0,'RIGHT':math.pi/2,'BACK':math.pi,'LEFT':3*math.pi/2}.get(pid.split('_')[1],0)
        return Vector((math.sin(ang)*0.78*level,-math.cos(ang)*0.78*level,2.06*level))
    if pid=='FINIAL':
        return Vector((0,0,2.35*level))
    if pid.startswith('RAIL_') or pid.startswith('BALUSTER'):
        return radial*(0.30*level) + Vector((0,0,0.22*level))
    return Vector((0,0,0))

def clear_lights_cameras():
    for o in list(bpy.data.objects):
        if o.type in {'LIGHT','CAMERA'}: bpy.data.objects.remove(o, do_unlink=True)

def mat_principled(name, color, rough=0.48, metallic=0.0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True
    if not m.node_tree.nodes.get('Principled BSDF'):
        m.node_tree.nodes.clear(); out=m.node_tree.nodes.new('ShaderNodeOutputMaterial'); bs=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled'); m.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
    bs=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metallic
    return m

def setup_scene(spec):
    sc=bpy.context.scene
    clear_lights_cameras()
    sc.render.engine='BLENDER_EEVEE'
    sc.render.resolution_x,sc.render.resolution_y=spec['size']; sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG'; sc.render.film_transparent=False
    sc.render.image_settings.color_mode='RGBA'
    sc.render.resolution_percentage=100
    sc.render.filepath=str(OUT/f"draft_{spec['size'][0]}x{spec['size'][1]}.png")
    sc.view_settings.look='AgX - Medium High Contrast'
    world=bpy.data.worlds.get('Cover Ivory World') or bpy.data.worlds.new('Cover Ivory World')
    sc.world=world; world.use_nodes=True
    nt=world.node_tree; nt.nodes.clear(); out=nt.nodes.new('ShaderNodeOutputWorld'); bg=nt.nodes.new('ShaderNodeBackground'); nt.links.new(bg.outputs['Background'],out.inputs['Surface']); bg.inputs['Color'].default_value=(0.88,0.845,0.77,1); bg.inputs['Strength'].default_value=0.5
    # Matte paper floor with a gentle shadow anchor.
    floor=bpy.data.objects.get('Cover Paper Floor')
    if not floor:
        floor=bpy.data.objects.new('Cover Paper Floor', bpy.data.meshes.new('Cover Paper Floor Mesh')); bpy.context.collection.objects.link(floor)
        bpy.context.view_layer.objects.active=floor; floor.select_set(True); bpy.ops.mesh.primitive_plane_add(size=60, location=(0,0,-0.12));
        added=bpy.context.object; floor.data=added.data; bpy.data.objects.remove(added, do_unlink=True)
    floor.location=(0,0,-0.12); floor.data.materials.clear(); floor.data.materials.append(mat_principled('Cover Ivory',(0.82,0.78,0.69),0.66))
    for loc,power,size in [((6,-8,14),1700,7),((-8,-5,9),1100,6),((4,8,12),1400,5),((0,0,16),700,5)]:
        d=bpy.data.lights.new('Cover Softbox','AREA');d.energy=power;d.shape='DISK';d.size=size
        o=bpy.data.objects.new('Cover Softbox',d);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,2.5))-o.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('Cover Camera');cam=bpy.data.objects.new('Cover Camera',d);sc.collection.objects.link(cam)
    cam.location=spec['cam']; cam.rotation_euler=(Vector(spec['target'])-cam.location).to_track_quat('-Z','Y').to_euler(); d.type='ORTHO'; d.ortho_scale=spec['scale']; sc.camera=cam

def main():
    bpy.ops.wm.open_mainfile(filepath=str(MODEL))
    with MANIFEST.open(encoding='utf-8') as f: manifest=json.load(f)
    parts=[]
    for p in manifest['parts']:
        o=bpy.data.objects.get(p['id'])
        if o: parts.append((p,o,o.matrix_world.copy()))
    if len(parts)<100: raise RuntimeError(f'expected 117 parts, got {len(parts)}')
    results=[]
    for ratio,spec in SPECS.items():
        # restore rest pose before each ratio; offsets below are actual applied values.
        for p,o,rest in parts:
            o.matrix_world=rest.copy()
            # Remove only the four decorative roof-skin tiles; keep roof decks, rafters and finial.
            o.hide_render = p['id'].startswith('TILE_')
        shift=Vector(spec['subject_shift'])
        offsets={}
        for p,o,rest in parts:
            off=offset_for(p,o,spec['level'],ratio)+shift
            o.matrix_world=rest.copy(); o.matrix_world.translation += off
            offsets[p['id']]=[round(float(v),5) for v in off]
        setup_scene(spec); bpy.context.view_layer.update()
        path=OUT/f"scene_{ratio}.png"; bpy.context.scene.render.filepath=str(path)
        bpy.ops.render.render(write_still=True)
        results.append({'ratio':ratio,'size':list(spec['size']),'level':spec['level'],'model':str(MODEL),'parts_rendered':len(parts),'visible_parts_rendered':sum(1 for p,_,_ in parts if not p['id'].startswith('TILE_')),'hidden_roof_tiles':['TILE_FRONT','TILE_RIGHT','TILE_BACK','TILE_LEFT'],'offsets_blender':offsets,'render':path.name,'camera':{'location':list(spec['cam']),'target':list(spec['target']),'ortho_scale':spec['scale']}})
    # restore canonical assembled pose and save a clean cover scene copy
    for p,o,rest in parts:
        o.matrix_world=rest.copy(); o.hide_render=False
    bpy.context.view_layer.update(); bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pavilion-cover-source.blend'))
    (OUT/'cover-render-manifest.json').write_text(json.dumps({'schema':'rainbow.cover.v5','source_model':str(MODEL),'parts':len(parts),'renders':results},ensure_ascii=False,indent=2),encoding='utf-8')
    print('COVER_V5_RENDERED',json.dumps(results,ensure_ascii=False)[:600],flush=True)

if __name__=='__main__': main()
