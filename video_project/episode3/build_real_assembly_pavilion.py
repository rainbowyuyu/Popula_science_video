"""Build a genuinely assembleable educational Chinese timber pavilion.

The old `crafted-pavilion` asset was a presentation prop: many roof and rail
parts were joined into decorative groups.  This builder keeps every structural
member as an independently named part, cuts real mortises in the posts, and
adds tenons/pegs as separate solids.  Dimensions are metric and follow a
3.0 m bay / 0.30 m structural module so the sequence can be explained and
reassembled in Blender/Three.js.  It is an educational reconstruction, not a
construction permit drawing.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
BLENDER_OUT = ROOT / "blender"
PUBLIC_OUT = ROOT.parent / "topology_optimization" / "public" / "episode3" / "models"
RESEARCH_OUT = ROOT / "research"
SOURCE_SPEC = ROOT.parent / "topology_optimization" / "research" / "episode3v2" / "real-pavilion-sources.json"
BLENDER_OUT.mkdir(parents=True, exist_ok=True)
PUBLIC_OUT.mkdir(parents=True, exist_ok=True)
RESEARCH_OUT.mkdir(parents=True, exist_ok=True)


def mat(name: str, color, roughness=0.5, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return material


def group(name: str, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def cube(name, loc, dims, material, parent, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    obj.parent = parent
    if bevel:
        mod = obj.modifiers.new("hand-planed edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cylinder(name, loc, radius, depth, material, parent, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    obj.parent = parent
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def beam_between(name, a, b, section, material, parent, bevel=0.01):
    """Rectangular timber with its local Z axis along a -> b."""
    a, b = Vector(a), Vector(b)
    length = (b - a).length
    obj = cube(name, (a + b) / 2, (section[0], section[1], length), material, parent, bevel)
    obj.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return obj


def prism(name, points, z0, z1, material, parent, bevel=0.0):
    verts = [(x, y, z) for z in (z0, z1) for x, y in points]
    n = len(points)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = parent
    if bevel:
        mod = obj.modifiers.new("dressed edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def boolean_cut(target, cutter):
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    mod = target.modifiers.new("cut joinery void", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def tag(obj, **kwargs):
    for key, value in kwargs.items():
        obj[key] = value


def mark_group(obj, step, label, joint="none"):
    tag(obj, assembly_step=step, assembly_label=label, primary_joint=joint,
        metric_units="m", source_note="parametric educational reconstruction")


def select_tree(root):
    bpy.ops.object.select_all(action="DESELECT")
    def visit(obj):
        obj.select_set(True)
        for child in obj.children:
            visit(child)
    visit(root)


def export_root(root, path):
    select_tree(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=True, export_extras=True, export_animations=True,
    )


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    # The installed portable build exposes the legacy EEVEE enum; keeping the
    # fallback makes the script portable across Blender 4.x and 5.x bundles.
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("warm rice paper")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.15, 0.18, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32
    scene.world = world

    wood = mat("Douglas fir / Chinese cedar", (0.38, 0.16, 0.055), 0.42)
    cutwood = mat("fresh cut tenon", (0.72, 0.40, 0.12), 0.48)
    darkwood = mat("aged end grain", (0.17, 0.06, 0.022), 0.52)
    stone = mat("granite footing", (0.34, 0.37, 0.38), 0.72)
    tile = mat("grey glazed tile", (0.09, 0.13, 0.16), 0.30)
    pegmat = mat("oak peg", (0.62, 0.30, 0.07), 0.50)
    brass = mat("brass joinery marker", (0.65, 0.32, 0.06), 0.25, 0.65)
    paper = mat("drawing paper", (0.75, 0.68, 0.52), 0.8)

    source_spec = {}
    if SOURCE_SPEC.exists():
        try:
            source_spec = json.loads(SOURCE_SPEC.read_text(encoding="utf-8"))
        except Exception as exc:  # preserve a runnable local builder if research is unavailable
            print(f"[real-pavilion] source spec unavailable: {exc}")
    plan = source_spec.get("parametricSpec", {}).get("plan", {})
    bay = float(plan.get("column_center_spacing_m_assumption", 3.0))
    pavilion = group("REAL_ASSEMBLY_PAVILION")
    tag(pavilion, design_title="Metric four-column Chinese timber pavilion",
        design_intent="true separable post-beam roof frame",
        bay_span_m=bay, module_m=0.30, eave_height_m=float(plan.get("eave_height_m_assumption", 3.60)),
        ridge_height_m=5.25, scale_note="educational reconstruction; verify local code")
    tag(pavilion, source_design_id=source_spec.get("designId", "local-parametric-reconstruction"),
        source_spec_path=str(SOURCE_SPEC), source_scope=source_spec.get("scopeNote", ""),
        slope_rule_reference="《营造法式》四角斗尖：第一段1:5、上簇1:2",
        slope_visual_exaggeration=True,
        slope_note="影视模型保留较陡屋面以便看清椽/角梁；不得称为严格测绘复原")

    stages = {}
    for n, label, analysis_group in [
        (0, "基础 / foundation stones", "PAV_BASE_STONE"), (1, "立柱 / four posts", "PAV_COL"),
        (2, "地栿 / sill beams", "PAV_LAN_E"), (3, "穿插枋 / tie beams", "PAV_EAVE_BEAM"),
        (4, "斗栱 / bracket sets", "PAV_BRACKET"), (5, "檩椽 / purlins and rafters", "PAV_RAFTER"),
        (6, "屋面 / roof boards and tiles", "PAV_ROOF_PANEL"), (7, "栏杆 / horizontal rails", "PAV_LAN_E_RAIL"),
    ]:
        stages[n] = group(f"{analysis_group}__STEP_{n:02d}", pavilion)
        mark_group(stages[n], n, label)
        tag(stages[n], simulation_group=analysis_group, source_design_id=source_spec.get("designId", ""))

    # A 3.00 m square bay on four 0.30 m posts.  The centerline and all
    # dimensions are deliberately explicit for the storyboard and audit.
    half_bay = bay / 2.0
    post_xy = [(-half_bay, -half_bay), (half_bay, -half_bay), (half_bay, half_bay), (-half_bay, half_bay)]
    post_groups = []
    for i, (x, y) in enumerate(post_xy):
        g = group(f"PAV_COL_{i+1:02d}_0p30x0p30x3p20", stages[1])
        mark_group(g, 1, "立柱 / post", "柱脚榫 + 穿枋榫眼")
        post = cube(f"post_{i+1:02d}", (x, y, 1.80), (0.30, 0.30, 3.20), wood, g, 0.018)
        tag(post, part_type="post", section_m="0.30 x 0.30", length_m=3.20,
            joint="mortises at sill/tie/eave levels", post_index=i + 1,
            # Each corner receives one inward-facing mortise on each axis at
            # the three beam elevations: 3 levels × 2 directions = 6 voids.
            mortise_count=6)
        # Mortises are cut into the inward-facing sides, so real tenons can
        # enter from the bay.  Three levels: sill, tie beam, and eave beam.
        for level, z in [("sill", 0.52), ("tie", 3.00), ("eave", 3.42)]:
            # X-facing opening for the east/west beam and Y-facing opening
            # for the north/south beam.  Both are cut from the bay-facing
            # side, leaving the outer corner face intact.
            cx = x - math.copysign(0.075, x)
            cutter_x = cube("mortise cutter x", (cx, y, z), (0.18, 0.18, 0.14), None, g, 0)
            boolean_cut(post, cutter_x)
            cy = y - math.copysign(0.075, y)
            cutter_y = cube("mortise cutter y", (x, cy, z), (0.18, 0.18, 0.14), None, g, 0)
            boolean_cut(post, cutter_y)
            tag(post, **{f"mortise_{level}_z_m": z})
        post_groups.append(g)

    # Granite footings are separate, so the timber can be removed without
    # taking the foundation with it.
    foundation = stages[0]
    cube("foundation_plinth", (0, 0, 0.05), (4.25, 4.25, 0.30), stone, foundation, 0.04)
    for i, (x, y) in enumerate(post_xy):
        foot = cube(f"stone_foot_{i+1:02d}", (x, y, 0.25), (0.52, 0.52, 0.28), stone, foundation, 0.035)
        tag(foot, part_type="stone footing", post_index=i + 1)

    # Beam helper: body spans inner post faces; the end tenons enter each post
    # by 0.15 m.  Tenons remain separate meshes for exploded assembly shots.
    def side_beam(name, axis, z, stage, material=wood, joint="through mortise-and-tenon"):
        # Prefixes are shared with the research BOM so Three.js/Zwind can
        # address a member family without relying on display labels.
        family = {"SILL": "PAV_LAN_E", "TIE": "PAV_EAVE_BEAM", "EAVE": "PAV_EAVE_RAIL"}.get(name.split("_")[0], name)
        g = group(f"{family}__{name}", stage)
        mark_group(g, stage["assembly_step"], name, joint)
        if axis == "x":
            body = cube(f"{name}_body", (0, 0, z), (bay - 0.30, 0.22, 0.22), material, g, 0.016)
            for x in (-bay / 2 + 0.075, bay / 2 - 0.075):
                tenon = cube(f"{name}_tenon_x_{x:+.2f}", (x, 0, z), (0.15, 0.14, 0.14), cutwood, g, 0.008)
                tag(tenon, part_type="tenon", joint="enter post mortise", axis="x")
        else:
            body = cube(f"{name}_body", (0, 0, z), (0.22, bay - 0.30, 0.22), material, g, 0.016)
            for y in (-bay / 2 + 0.075, bay / 2 - 0.075):
                tenon = cube(f"{name}_tenon_y_{y:+.2f}", (0, y, z), (0.14, 0.15, 0.14), cutwood, g, 0.008)
                tag(tenon, part_type="tenon", joint="enter post mortise", axis="y")
        tag(body, part_type="beam body", axis=axis, clear_span_m=bay - 0.30,
            end_tenon_m=0.15, joint=joint)
        return g

    # Four lower sill beams and four high tie/eave beams.
    for z, prefix, stage in [(0.52, "SILL", stages[2]), (3.00, "TIE", stages[3]), (3.42, "EAVE", stages[3])]:
        for j, axis in enumerate(("x", "y")):
            for side in (-1, 1):
                g = side_beam(f"{prefix}_{axis}_{side:+d}", axis, z, stage,
                              wood if prefix != "EAVE" else cutwood,
                              "through mortise-and-tenon")
                # Position the beam on the side of the square bay.
                if axis == "x":
                    g.location.y = side * half_bay
                else:
                    g.location.x = side * half_bay

    # Bracket sets: alternating 拱 and 垫木 blocks under each eave beam.
    for i, (x, y) in enumerate(post_xy):
        g = group(f"PAV_BRACKET_SET_{i+1:02d}", stages[4])
        mark_group(g, 4, "斗栱 / bracket set", "栌斗-拱-昂")
        for layer in range(3):
            z = 3.59 + layer * 0.13
            # Alternating orientation is the key visual cue, while each block
            # remains a real separable member.
            if layer % 2 == 0:
                a = cube(f"dou_{i+1:02d}_{layer+1}_cross", (x, y, z), (0.64, 0.22, 0.14), cutwood, g, 0.012)
                tag(a, part_type="拱", orientation="x", layer=layer + 1)
            else:
                a = cube(f"dou_{i+1:02d}_{layer+1}_depth", (x, y, z), (0.22, 0.64, 0.14), wood, g, 0.012)
                tag(a, part_type="拱", orientation="y", layer=layer + 1)
            pad = cube(f"dou_{i+1:02d}_{layer+1}_pad", (x, y, z + 0.08), (0.31, 0.31, 0.10), wood, g, 0.010)
            tag(pad, part_type="栌斗", layer=layer + 1)
        # A short diagonal 昂 makes the force path legible without pretending
        # to reproduce a palace-scale bracket catalogue.
        arm = beam_between(f"昂_{i+1:02d}", (x, y, 3.90), (x + math.copysign(0.46, x), y + math.copysign(0.46, y), 4.16), (0.15, 0.15), wood, g, 0.012)
        tag(arm, part_type="昂", load_path="roof -> bracket -> post")

    # Purlins sit at the four eaves and at the ridge.  They are independent
    # pieces so the roof can be assembled in a visible, ordered sequence.
    purlin_stage = stages[5]
    for j, (axis, side) in enumerate((("x", -1), ("x", 1), ("y", -1), ("y", 1))):
        if axis == "x":
            p = cube(f"PAV_EAVE_RAIL_purlin_{j+1:02d}", (0, side * 1.62, 4.16), (3.65, 0.16, 0.16), wood, purlin_stage, 0.012)
        else:
            p = cube(f"PAV_EAVE_RAIL_purlin_{j+1:02d}", (side * 1.62, 0, 4.16), (0.16, 3.65, 0.16), wood, purlin_stage, 0.012)
        tag(p, part_type="檩", joint="坐榫", purlin_index=j + 1)
    ridge = cube("PAV_HUB_ridge_cross_purlin", (0, 0, 5.08), (0.26, 0.26, 0.26), wood, purlin_stage, 0.014)
    tag(ridge, part_type="脊檩", joint="坐榫")

    # Explicit four-corner hip rafters.  The earlier toy asset implied a roof
    # with a flat cap; these members now carry the corner eave reaction to a
    # single central hub, matching the four-corner 攒尖 sequence in the source
    # spec.  Sub-hip members fill the two intermediate lines on each face.
    hip_stage = stages[5]
    roof_eave = 1.63
    roof_apex = (0.0, 0.0, 5.13)
    corners = [(-roof_eave, -roof_eave, 4.23), (roof_eave, -roof_eave, 4.23),
               (roof_eave, roof_eave, 4.23), (-roof_eave, roof_eave, 4.23)]
    for i, corner in enumerate(corners, 1):
        hip = beam_between(f"PAV_HIP_MAIN_{i:02d}", corner, roof_apex, (0.17, 0.17), cutwood, hip_stage, 0.012)
        tag(hip, part_type="大角樑", hip_index=i, joint="斜向榫/中央棖杆", load_path="roof -> hub")
    sub_points = [(-0.55, -roof_eave, 4.23), (0.55, -roof_eave, 4.23),
                  (roof_eave, -0.55, 4.23), (roof_eave, 0.55, 4.23),
                  (0.55, roof_eave, 4.23), (-0.55, roof_eave, 4.23),
                  (-roof_eave, 0.55, 4.23), (-roof_eave, -0.55, 4.23)]
    for i, point in enumerate(sub_points, 1):
        hip = beam_between(f"PAV_HIP_SUB_{i:02d}", point, roof_apex, (0.12, 0.12), wood, hip_stage, 0.009)
        tag(hip, part_type="子角樑/隱角樑", hip_index=i, joint="抱槫口", load_path="roof -> eave purlin")
    hub = cylinder("PAV_HUB_central_cheng_rod", roof_apex, 0.19, 0.42, brass, hip_stage)
    tag(hub, part_type="中央棖杆/宝顶芯", joint="四向汇交", load_path="hip rafters")

    # Individual rafters are rectangular timbers from four eaves to the hip
    # apex.  They are deliberately unmerged for camera tracking and force map.
    rafters_stage = stages[5]
    n_rafters = 7
    for side in range(4):
        for k in range(n_rafters):
            u = -1 + 2 * k / (n_rafters - 1)
            # side-local edge from -1.58 to 1.58; rotate around the center.
            if side == 0:
                a, b = (u * 1.58, -1.63, 4.23), (u * 0.18, -0.18, 5.13)
            elif side == 1:
                a, b = (1.63, u * 1.58, 4.23), (0.18, u * 0.18, 5.13)
            elif side == 2:
                a, b = (u * 1.58, 1.63, 4.23), (u * 0.18, 0.18, 5.13)
            else:
                a, b = (-1.63, u * 1.58, 4.23), (-0.18, u * 0.18, 5.13)
            rafter = beam_between(f"PAV_RAFTER_s{side+1}_{k+1:02d}", a, b, (0.105, 0.105), cutwood, rafters_stage, 0.008)
            tag(rafter, part_type="椽", roof_side=side + 1, rafter_index=k + 1, source_group="PAV_RAFTER",
                joint="搭接 at eave purlin")

    # Four removable triangular roof boards are the substrate.  Tile ribs are
    # decorative but still separate, and are kept light for the video.
    roof_stage = stages[6]
    for side in range(4):
        if side == 0:
            pts = [(-1.66, -1.70), (1.66, -1.70), (0.0, -0.12)]
        elif side == 1:
            pts = [(1.70, -1.66), (1.70, 1.66), (0.12, 0.0)]
        elif side == 2:
            pts = [(1.66, 1.70), (-1.66, 1.70), (0.0, 0.12)]
        else:
            pts = [(-1.70, 1.66), (-1.70, -1.66), (-0.12, 0.0)]
        panel = prism(f"PAV_ROOF_PANEL_{side+1}", pts, 4.22, 4.30, paper, roof_stage, 0.006)
        tag(panel, part_type="望板", roof_side=side + 1, removable=True)
        # Three representative tile battens preserve the visual scale.
        for k in range(3):
            t = (k + 1) / 4
            half = 1.58 * (1.0 - 0.62 * t)
            if side == 0:
                a, b = (-half, -1.72, 4.35), (half, -1.72, 4.35)
            elif side == 1:
                a, b = (1.72, -half, 4.35), (1.72, half, 4.35)
            elif side == 2:
                a, b = (half, 1.72, 4.35), (-half, 1.72, 4.35)
            else:
                a, b = (-1.72, half, 4.35), (-1.72, -half, 4.35)
            rib = beam_between(f"tile_batten_s{side+1}_{k+1}", a, b, (0.06, 0.06), tile, roof_stage, 0.004)
            tag(rib, part_type="瓦条", roof_side=side + 1)
    cap = cylinder("ridge_finial", (0, 0, 5.32), 0.14, 0.34, brass, roof_stage)
    tag(cap, part_type="宝顶", removable=True)

    # Horizontal rails: two rails and six square balusters per side.
    rail_stage = stages[7]
    for side in (-1, 1):
        for z in (0.86, 1.20):
            r = cube(f"rail_horizontal_y{side:+d}_z{z:.2f}", (0, side * 1.47, z), (2.72, 0.10, 0.10), wood, rail_stage, 0.008)
            tag(r, part_type="栏杆横枋", orientation="x")
        for i, x in enumerate((-1.15, -0.69, -0.23, 0.23, 0.69, 1.15)):
            bal = cube(f"baluster_y{side:+d}_{i+1}", (x, side * 1.47, 1.03), (0.08, 0.08, 0.52), cutwood, rail_stage, 0.006)
            tag(bal, part_type="栏杆望柱", removable=True)
    for side in (-1, 1):
        for z in (0.86, 1.20):
            r = cube(f"rail_horizontal_x{side:+d}_z{z:.2f}", (side * 1.47, 0, z), (0.10, 2.72, 0.10), wood, rail_stage, 0.008)
            tag(r, part_type="栏杆横枋", orientation="y")
        for i, y in enumerate((-1.15, -0.69, -0.23, 0.23, 0.69, 1.15)):
            bal = cube(f"baluster_x{side:+d}_{i+1}", (side * 1.47, y, 1.03), (0.08, 0.08, 0.52), cutwood, rail_stage, 0.006)
            tag(bal, part_type="栏杆望柱", removable=True)

    # A separate cutaway joint demonstrates how one of the real pavilion
    # beams seats into a post. It shares the same dimensions as the assembly.
    demo = group("JOINT_CUTAWAY_REAL_SCALE", pavilion)
    mark_group(demo, 9, "真实比例节点 / cutaway joint", "穿枋榫")
    demo.location = (5.2, -3.2, 0.0)
    demo_post = cube("demo_post", (0, 0, 1.5), (0.30, 0.30, 3.0), wood, demo, 0.012)
    demo_cut = cube("demo_mortise_cutter", (0, 0, 2.0), (0.18, 0.30, 0.16), None, demo, 0)
    boolean_cut(demo_post, demo_cut)
    demo_beam = cube("demo_beam", (0.9, 0, 2.0), (1.8, 0.22, 0.22), cutwood, demo, 0.010)
    demo_tenon = cube("demo_tenon", (0.12, 0, 2.0), (0.24, 0.14, 0.14), cutwood, demo, 0.006)
    tag(demo_post, part_type="post", section_m="0.30 x 0.30")
    tag(demo_beam, part_type="穿枋", clear_span_m=1.8)
    tag(demo_tenon, part_type="榫头", length_m=0.24)
    peg = cylinder("demo_wood_peg", (0.08, -0.20, 2.0), 0.045, 0.40, pegmat, demo)
    peg.rotation_euler[0] = math.pi / 2
    tag(peg, part_type="木销", joint="drawbore peg")

    # Assembly animation: all groups start gently exploded around the pavilion
    # and move into place in construction order. No parts teleport on screen.
    offsets = {
        0: (0, 0, -0.35), 1: (0, 0, 2.4), 2: (-1.8, 0, 0.6),
        3: (1.8, 0, 0.8), 4: (0, 1.6, 1.2), 5: (0, -1.7, 1.4),
        6: (0, 0, 2.1), 7: (0, 0, 0.9),
    }
    for step, stage in stages.items():
        stage.location = offsets[step]
        stage.keyframe_insert(data_path="location", frame=1)
        stage.location = (0, 0, 0)
        stage.keyframe_insert(data_path="location", frame=42 + step * 24)
        stage.keyframe_insert(data_path="location", frame=72 + step * 24)
    scene.frame_start = 1
    scene.frame_end = 280
    scene.frame_set(scene.frame_end)

    # Camera and neutral studio lights; the WebGL composition can reframe the
    # GLB later while the .blend preserves a good audit view.
    for loc, energy, size, color in [
        ((7, -8, 10), 1300, 5.5, (1.0, 0.76, 0.50)),
        ((-6, -2, 7), 900, 5.0, (0.55, 0.72, 1.0)),
        ((0, 5, 8), 1100, 4.0, (1.0, 0.88, 0.68)),
    ]:
        data = bpy.data.lights.new("softbox", "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        light = bpy.data.objects.new("softbox", data)
        scene.collection.objects.link(light)
        light.location = loc
        light.rotation_euler = (Vector((0, 0, 2.2)) - light.location).to_track_quat("-Z", "Y").to_euler()
    cam_data = bpy.data.cameras.new("Camera")
    camera = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(camera)
    camera.location = (8.2, -9.2, 7.2)
    camera.rotation_euler = (Vector((0, 0, 2.3)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 52
    scene.camera = camera

    # Add an assembly index for Three.js/Remotion. This is intentionally
    # emitted next to the GLB so narration can call out exact parts.
    component_rows = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.parent is None:
            continue
        if "part_type" in obj:
            component_rows.append({
                "name": obj.name,
                "part_type": obj.get("part_type"),
                "assembly_step": int(obj.get("assembly_step", obj.parent.get("assembly_step", 0))),
                "joint": obj.get("joint", obj.parent.get("primary_joint", "none")),
                "dimensions_m": [round(float(v), 4) for v in obj.dimensions],
            })
    component_rows.sort(key=lambda row: (row["assembly_step"], row["name"]))
    index = {
        "schema": "rainbow.real-assembly-pavilion/v1",
        "title": "四柱三米开间可装配榫卯亭",
        "units": "m",
        "educational_reconstruction": True,
        "construction_warning": "按传统构造逻辑的影视/科普模型，施工前须由结构工程师和木作师复核",
        "design_basis": {
            "bay_span_m": 3.0,
            "module_m": 0.30,
            "post_section_m": [0.30, 0.30],
            "eave_height_m": 3.60,
            "ridge_height_m": 5.25,
        },
        "assembly_steps": [stages[i].get("assembly_label") for i in range(8)],
        "joint_types": ["穿枋榫", "坐榫", "栌斗-拱-昂", "拉肩木销", "搭接"],
        "source_spec": {
            "design_id": source_spec.get("designId", ""),
            "parametric_spec": source_spec.get("parametricSpec", {}),
            "parts_bom": source_spec.get("partsBOM", []),
            "joint_map": source_spec.get("jointMap", []),
            "assembly_order": source_spec.get("assemblyOrder", []),
            "simulation_ready": source_spec.get("simulationReady", {}),
            "modeling_qa": source_spec.get("modelingQA", []),
        },
        "components": component_rows,
        "outputs": {
            "blend": str(BLENDER_OUT / "real_assembly_pavilion.blend"),
            "glb": str(PUBLIC_OUT / "real-assembly-pavilion.glb"),
        },
    }
    (RESEARCH_OUT / "real-pavilion-components.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    # Export the assembled asset with animation and a still for visual audit.
    export_root(pavilion, PUBLIC_OUT / "real-assembly-pavilion.glb")
    scene.render.filepath = str(BLENDER_OUT / "real-assembly-pavilion.png")
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLENDER_OUT / "real_assembly_pavilion.blend"))

    # A compact geometry audit has no Blender dependency and is useful to the
    # parent video task when deciding which parts to feature.
    audit = {
        "schema": "rainbow.real-pavilion-audit/v1",
        "objects_total": len(bpy.data.objects),
        "mesh_objects": len([o for o in bpy.data.objects if o.type == "MESH"]),
        "groups": len(stages),
        "post_objects_with_six_mortises": len([o for o in bpy.data.objects if o.get("mortise_count") == 6]),
        "tenon_objects": len([o for o in bpy.data.objects if "tenon" in o.name]),
        "separable_structural_parts": len(component_rows),
        "animation_frames": scene.frame_end,
        "metric_bay_span_m": bay,
        "warnings": ["educational reconstruction; not a construction drawing"],
        "slope_visual_exaggeration": True,
        "slope_rule_reference": "《营造法式》第一段1:5、上簇1:2；本模型为镜头可读性的视觉代理",
    }
    (BLENDER_OUT / "real-pavilion-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(audit, ensure_ascii=False))


if __name__ == "__main__":
    main()
