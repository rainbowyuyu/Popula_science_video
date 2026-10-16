import json
from pathlib import Path
from mathutils import Vector
def three(v):return [round(float(v[0]),6),round(float(v[2]),6),round(-float(v[1]),6)]
def assembly_keys(pid, p):
    parent = p['parent']
    front = parent == 'BENT_FRONT'
    back = parent == 'BENT_BACK'
    sy = -1 if front else 1
    bent = Vector((0, sy * 0.85, 0)) if front or back else Vector((0, 0, 0))
    local = []
    if pid.startswith('STONE_') or pid == 'PLINTH':
        local = [(0, (0, 0, 0)), (1, (0, 0, 0))]
    elif pid.startswith('POST_'):
        sx = -1 if pid.endswith('L') else 1
        local = [(0, (sx * 0.6, 0, 0)), (0.12, (sx * 0.6, 0, 0)), (0.21, (0, 0, 0))]
    elif pid.startswith('BRACE_'):
        local = [(0, (0, 0, -0.42)), (0.035, (0, 0, -0.42)), (0.1, (0, 0, 0))]
    elif pid.startswith('PEG_X_'):
        local = [(0, (0, -0.45, 0)), (0.23, (0, -0.45, 0)), (0.29, (0, 0, 0))]
    elif pid.startswith('PEG_Y_'):
        local = [(0, (-0.5, 0, 0)), (0.46, (-0.5, 0, 0)), (0.51, (0, 0, 0))]
    elif pid.startswith('RAIL_BACK_'):
        local = [(0, (0, 0, 0)), (1, (0, 0, 0))]
    elif pid.startswith('DOU_'):
        local = [(0, (0, 0, 1.4)), (0.52, (0, 0, 1.4)), (0.56, (0, 0, 0))]
    elif pid.startswith('GONG_X_'):
        local = [(0, (0, 0, 1.7)), (0.57, (0, 0, 1.7)), (0.6, (0, 0, 0))]
    elif pid.startswith('GONG_Y_'):
        local = [(0, (0, 0, 1.9)), (0.605, (0, 0, 1.9)), (0.63, (0, 0, 0))]
    elif pid.startswith('CAP_'):
        local = [(0, (0, 0, 2.1)), (0.635, (0, 0, 2.1)), (0.66, (0, 0, 0))]
    elif pid.startswith('PURLIN_X_'):
        local = [(0, (0, 0, 2.4)), (0.665, (0, 0, 2.4)), (0.7, (0, 0, 0))]
    elif pid.startswith('PURLIN_Y_'):
        local = [(0, (0, 0, 2.6)), (0.705, (0, 0, 2.6)), (0.74, (0, 0, 0))]
    elif pid == 'SUPPORT_X':
        local = [(0, (0, 0, 2.8)), (0.745, (0, 0, 2.8)), (0.77, (0, 0, 0))]
    elif pid == 'SUPPORT_Y':
        local = [(0, (0, 0, 3.0)), (0.775, (0, 0, 3.0)), (0.8, (0, 0, 0))]
    elif pid == 'CENTRE_POST':
        local = [(0, (0, 0, 3.1)), (0.805, (0, 0, 3.1)), (0.83, (0, 0, 0))]
    elif pid == 'HUB':
        local = [(0, (0, 0, 3.1)), (0.835, (0, 0, 3.1)), (0.855, (0, 0, 0))]
    elif pid.startswith('HIP_'):
        sx = -1 if pid.endswith('L') else 1
        sy = -1 if pid.startswith('HIP_F') else 1
        local = [(0, (sx * 2.6, sy * 2.6, 2.7)), (0.835, (sx * 2.6, sy * 2.6, 2.7)), (0.855, (sx * 2.6, sy * 2.6, 0.6)), (0.875, (0, 0, 0.6)), (0.893, (0, 0, 0))]
    elif pid.startswith('RAF_'):
        i = int(pid.split('_')[2])
        a = 0.897 + i * 0.0015
        local = [(0, (0, 0, 3.5)), (a, (0, 0, 3.5)), (a + 0.031, (0, 0, 0))]
    elif pid.startswith('DECK_'):
        local = [(0, (0, 0, 3.95)), (0.952, (0, 0, 3.95)), (0.979, (0, 0, 0))]
    elif pid.startswith('TILE_') or pid == 'FINIAL':
        local = [(0, (0, 0, 4.2)), (0.98, (0, 0, 4.2)), (1, (0, 0, 0))]
    else:
        local = [(0, (0, 0, 0)), (1, (0, 0, 0))]
    times = sorted(set([t for t, v in local] + ([0.32, 0.45, 1] if front or back else [1])))

    def interp(t):
        if t <= local[0][0]:
            return Vector(local[0][1])
        for (a, av), (b, bv) in zip(local, local[1:]):
            if t <= b:
                return Vector(av).lerp(Vector(bv), (t - a) / (b - a))
        return Vector(local[-1][1])
    out = []
    for t in times:
        f = 1 if t <= 0.32 else 0 if t >= 0.45 else 1 - (t - 0.32) / 0.13
        off = interp(t) + bent * f
        out.append({'t': t, 'offset_blender': list(off), 'offset_three': three(off)})
    return out
base=Path(r"D:/python_project/manim_extend_rainbow/video_project/topology_optimization")
for path in [base/"research/episode3v7/pavilion-manifest.json",base/"public/episode3v7/models/pavilion-manifest.json"]:
 m=json.loads(path.read_text(encoding="utf8"))
 for p in m["parts"]:p["assembly_keys"]=assembly_keys(p["id"],p)
 path.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding="utf8")
print("KEYS_REFRESHED")
