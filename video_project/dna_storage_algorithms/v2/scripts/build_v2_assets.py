"""Build reusable DNA-storage visualisation assets with Blender.

This script intentionally creates deterministic, named placeholder assets rather
than pretending to be a measured laboratory model.  All dimensions are metres,
the origin is the centre of the scene, and every reusable object is placed in a
named collection.  Running it with Blender writes a self-contained .blend, a
combined .glb, per-asset .glb files, and a machine-readable manifest under
``v2/public/3d``.

Run from any directory:

    D:\\blender\\blender.exe --background --factory-startup \\
      --python v2/scripts/build_v2_assets.py --python-exit-code 1
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Matrix, Vector


SCRIPT = Path(__file__).resolve()
V2_ROOT = SCRIPT.parents[1]
OUT_DIR = V2_ROOT / "public" / "3d"
BLEND_PATH = OUT_DIR / "dna_v2_assets.blend"
COMBINED_GLB = OUT_DIR / "dna_v2_assets.glb"
MANIFEST_PATH = OUT_DIR / "manifest.json"

VERSION = "dna-v2-assets-2026-10-11"
FPS = 30


PALETTE = {
    "ink": (0.025, 0.08, 0.11, 1.0),
    "floor": (0.08, 0.14, 0.16, 1.0),
    "bench": (0.14, 0.22, 0.23, 1.0),
    "glass": (0.44, 0.85, 0.91, 0.42),
    "chip": (0.18, 0.34, 0.37, 1.0),
    "cyan": (0.03, 0.82, 0.88, 1.0),
    "cyan_dim": (0.02, 0.36, 0.43, 1.0),
    "gold": (0.95, 0.61, 0.20, 1.0),
    "coral": (0.94, 0.30, 0.27, 1.0),
    "purple": (0.59, 0.30, 0.94, 1.0),
    "white": (0.84, 0.95, 0.93, 1.0),
    "fluid": (0.05, 0.42, 0.92, 1.0),
}


def rgba(name: str, alpha: float | None = None) -> tuple[float, float, float, float]:
    c = PALETTE[name]
    return (c[0], c[1], c[2], c[3] if alpha is None else alpha)


def ensure_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    owner = parent or bpy.context.scene.collection
    if collection.name not in owner.children:
        try:
            owner.children.link(collection)
        except RuntimeError:
            pass
    return collection


def link_only(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def make_material(
    name: str,
    color: Sequence[float],
    *,
    roughness: float = 0.42,
    metallic: float = 0.0,
    emission_strength: float = 0.0,
    transmission: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = tuple(color)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = transmission
        elif "Transmission" in bsdf.inputs:
            bsdf.inputs["Transmission"].default_value = transmission
        if emission_strength > 0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = tuple(color)
                bsdf.inputs["Emission Strength"].default_value = emission_strength
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = tuple(color)
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    alpha = float(color[3]) if len(color) > 3 else 1.0
    if alpha < 1.0:
        material.surface_render_method = "DITHERED"
        material.diffuse_color = tuple(color)
        material.use_transparency_overlap = False
    material["generated_by"] = VERSION
    return material


def add_bevel(obj: bpy.types.Object, width: float = 0.035, segments: int = 3) -> None:
    if width <= 0:
        return
    modifier = obj.modifiers.new("soft_edges", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"


def tag(obj: bpy.types.Object, role: str, collection: str, *, source: str = "procedural") -> bpy.types.Object:
    obj["asset_role"] = role
    obj["asset_collection"] = collection
    obj["source"] = source
    obj["unit"] = "meter"
    obj["coordinate_system"] = "Blender Z-up, right-handed"
    return obj


def cube(
    name: str,
    location: Sequence[float],
    dimensions: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel: float = 0.035,
    role: str = "solid",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_only(obj, collection)
    obj.data.materials.append(material)
    add_bevel(obj, bevel)
    return tag(obj, role, collection.name)


def cylinder(
    name: str,
    location: Sequence[float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    vertices: int = 48,
    role: str = "cylinder",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    link_only(obj, collection)
    obj.data.materials.append(material)
    add_bevel(obj, min(radius * 0.16, 0.025), 2)
    return tag(obj, role, collection.name)


def sphere(
    name: str,
    location: Sequence[float],
    radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    role: str = "sphere",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    link_only(obj, collection)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return tag(obj, role, collection.name)


def curve_tube(
    name: str,
    points: Iterable[Sequence[float]],
    radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    role: str = "tube",
    cyclic: bool = False,
) -> bpy.types.Object:
    coords = [tuple(p) for p in points]
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("NURBS")
    spline.points.add(len(coords) - 1)
    for point, co in zip(spline.points, coords):
        point.co = (*co, 1.0)
    spline.order_u = min(3, len(coords))
    spline.use_endpoint_u = True
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    curve.materials.append(material)
    return tag(obj, role, collection.name)


def empty(name: str, location: Sequence[float], collection: bpy.types.Collection, role: str = "anchor") -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.22
    obj.location = location
    collection.objects.link(obj)
    return tag(obj, role, collection.name)


def parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> bpy.types.Object:
    """Parent an object without changing its authored world-space pose."""
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    return obj


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def build_materials() -> dict[str, bpy.types.Material]:
    return {
        "ink": make_material("MAT_ink", rgba("ink"), roughness=0.55),
        "floor": make_material("MAT_floor", rgba("floor"), roughness=0.78),
        "bench": make_material("MAT_bench", rgba("bench"), roughness=0.42),
        "glass": make_material("MAT_glass", rgba("glass"), roughness=0.12, transmission=0.15),
        "chip": make_material("MAT_chip", rgba("chip"), roughness=0.28, metallic=0.12),
        "cyan": make_material("MAT_cyan", rgba("cyan"), roughness=0.25, emission_strength=1.4),
        "cyan_dim": make_material("MAT_cyan_dim", rgba("cyan_dim"), roughness=0.32, emission_strength=0.35),
        "gold": make_material("MAT_gold", rgba("gold"), roughness=0.26, metallic=0.18, emission_strength=0.5),
        "coral": make_material("MAT_coral", rgba("coral"), roughness=0.28, emission_strength=0.55),
        "purple": make_material("MAT_purple", rgba("purple"), roughness=0.3, emission_strength=0.7),
        "white": make_material("MAT_white", rgba("white"), roughness=0.34),
        "fluid": make_material("MAT_fluid", rgba("fluid"), roughness=0.18, metallic=0.08, emission_strength=1.1),
    }


def build_lab_environment(m: dict[str, bpy.types.Material]) -> bpy.types.Collection:
    col = ensure_collection("ASSET_LAB_ENV")
    cube("LAB_floor", (0.0, 0.0, -0.28), (12.0, 9.0, 0.5), m["floor"], col, bevel=0.12, role="environment_floor")
    cube("LAB_backdrop", (0.0, 4.0, 3.2), (12.0, 0.25, 7.0), m["ink"], col, bevel=0.08, role="environment_backdrop")
    cube("LAB_bench", (0.0, 0.6, 0.0), (10.0, 4.5, 0.28), m["bench"], col, bevel=0.08, role="environment_bench")
    for x in (-4.2, 4.2):
        cube(f"LAB_bench_leg_{'L' if x < 0 else 'R'}", (x, 0.6, -1.15), (0.35, 0.35, 2.0), m["bench"], col, bevel=0.04, role="environment_support")
    return col


def build_microfluidic_chip(m: dict[str, bpy.types.Material]) -> bpy.types.Collection:
    col = ensure_collection("ASSET_MICROFLUIDIC_CHIP")
    root = empty("MICROCHIP_ROOT", (-3.1, 0.45, 1.05), col, "asset_root")
    base = cube("MICROCHIP_SUBSTRATE", (-3.1, 0.45, 1.05), (4.45, 2.8, 0.22), m["chip"], col, bevel=0.09, role="chip_substrate")
    parent_keep_world(base, root)
    cover = cube("MICROCHIP_GLASS_COVER", (-3.1, 0.45, 1.21), (4.35, 2.7, 0.06), m["glass"], col, bevel=0.035, role="transparent_cover")
    parent_keep_world(cover, root)
    points = [
        (-4.7, 1.15, 1.31), (-4.15, 1.15, 1.31), (-3.85, 0.85, 1.31),
        (-3.85, -0.45, 1.31), (-3.35, -0.95, 1.31), (-2.2, -0.95, 1.31),
        (-1.65, -0.45, 1.31), (-1.65, 0.75, 1.31), (-1.15, 1.15, 1.31), (-0.55, 1.15, 1.31),
    ]
    channel = curve_tube("MICROCHIP_CHANNEL_SERPENTINE", points, 0.075, m["cyan_dim"], col, role="microfluidic_channel")
    parent_keep_world(channel, root)
    fluid = curve_tube("MICROCHIP_FLUID_CORE", points, 0.027, m["fluid"], col, role="flow_visualisation")
    parent_keep_world(fluid, root)
    for i, x in enumerate((-4.82, -0.42)):
        port = cylinder(f"MICROCHIP_PORT_{i+1}", (x, 1.15, 1.36), 0.22, 0.18, m["gold"], col, role="fluid_port")
        parent_keep_world(port, root)
    for i, (x, y) in enumerate(((-4.15, 0.55), (-3.25, 0.1), (-2.3, 0.35), (-1.45, 0.9))):
        well = cylinder(f"MICROCHIP_WELL_{i+1:02d}", (x, y, 1.34), 0.12, 0.07, m["coral"], col, role="reaction_well")
        parent_keep_world(well, root)
    return col


def build_sequencing_flowcell(m: dict[str, bpy.types.Material]) -> bpy.types.Collection:
    col = ensure_collection("ASSET_SEQUENCING_FLOWCELL")
    root = empty("FLOWCELL_ROOT", (3.1, 0.45, 1.05), col, "asset_root")
    body = cube("FLOWCELL_BODY", (3.1, 0.45, 1.05), (4.35, 2.7, 0.24), m["chip"], col, bevel=0.09, role="flowcell_body")
    parent_keep_world(body, root)
    top = cube("FLOWCELL_WINDOW", (3.1, 0.45, 1.22), (4.23, 2.58, 0.06), m["glass"], col, bevel=0.035, role="transparent_window")
    parent_keep_world(top, root)
    for row, y in enumerate((1.25, 0.45, -0.35)):
        points = [(1.25, y, 1.32), (2.05, y, 1.32), (2.45, y + 0.25, 1.32), (3.75, y + 0.25, 1.32), (4.95, y, 1.32)]
        rail = curve_tube(f"FLOWCELL_CHANNEL_{row+1}", points, 0.07, m["cyan_dim"], col, role="sequencing_channel")
        parent_keep_world(rail, root)
        flow = curve_tube(f"FLOWCELL_READ_FLOW_{row+1}", points, 0.023, m["fluid"], col, role="read_flow")
        parent_keep_world(flow, root)
    for i in range(16):
        x = 1.45 + (i % 8) * 0.48
        y = -1.0 + (i // 8) * 0.35
        well = cylinder(f"FLOWCELL_WELL_{i+1:02d}", (x, y, 1.34), 0.075, 0.07, m["purple" if i % 2 else "gold"], col, role="sequencing_well")
        parent_keep_world(well, root)
    for label, x in (("INLET", 1.0), ("OUTLET", 5.2)):
        port = cylinder(f"FLOWCELL_PORT_{label}", (x, 1.25, 1.39), 0.19, 0.2, m["gold"], col, role="flowcell_port")
        parent_keep_world(port, root)
    return col


def build_droplet(m: dict[str, bpy.types.Material]) -> bpy.types.Collection:
    col = ensure_collection("ASSET_DROPLET")
    root = empty("DROPLET_ROOT", (0.0, 3.1, 1.85), col, "asset_root")
    shell = sphere("DROPLET_SHELL", (0.0, 3.1, 1.85), 1.18, m["glass"], col, role="droplet_shell")
    parent_keep_world(shell, root)
    for i in range(28):
        theta = i * math.pi * (3.0 - math.sqrt(5.0))
        z = 1.0 - (2.0 * i + 1.0) / 28.0
        radius = math.sqrt(max(0.0, 1.0 - z * z)) * 0.78
        p = (radius * math.cos(theta), 3.1 + radius * math.sin(theta), 1.85 + z * 0.78)
        bead = sphere(f"DROPLET_PAYLOAD_{i+1:02d}", p, 0.085, m["cyan" if i % 3 else "coral"], col, role="payload_fragment")
        parent_keep_world(bead, root)
    for j, color in enumerate(("gold", "cyan", "purple")):
        torus_data = bpy.data.curves.new(f"DROPLET_RING_{j+1}", "CURVE")
        torus_data.dimensions = "3D"
        torus_data.bevel_depth = 0.012
        torus_data.bevel_resolution = 3
        spline = torus_data.splines.new("POLY")
        steps = 64
        spline.points.add(steps - 1)
        for k in range(steps):
            a = 2 * math.pi * k / steps
            spline.points[k].co = (0.95 * math.cos(a), 3.1 + 0.95 * math.sin(a), 1.85 + (j - 1) * 0.2, 1.0)
        spline.use_cyclic_u = True
        ring = bpy.data.objects.new(f"DROPLET_RING_{j+1}", torus_data)
        col.objects.link(ring)
        torus_data.materials.append(m[color])
        tag(ring, "droplet_boundary_ring", col.name)
        parent_keep_world(ring, root)
    return col


def build_double_helix(m: dict[str, bpy.types.Material]) -> bpy.types.Collection:
    col = ensure_collection("ASSET_DNA_DOUBLE_HELIX")
    root = empty("HELIX_ROOT", (0.0, -2.65, 1.85), col, "asset_root")
    left: list[tuple[float, float, float]] = []
    right: list[tuple[float, float, float]] = []
    turns = 2.45
    count = 100
    for i in range(count):
        t = i / (count - 1)
        angle = turns * 2 * math.pi * t
        z = 0.3 + t * 3.1
        left.append((-0.43 * math.cos(angle), -2.65 + 0.43 * math.sin(angle), z))
        right.append((0.43 * math.cos(angle), -2.65 - 0.43 * math.sin(angle), z))
    parent_keep_world(curve_tube("HELIX_STRAND_A", left, 0.045, m["cyan"], col, role="dna_backbone"), root)
    parent_keep_world(curve_tube("HELIX_STRAND_B", right, 0.045, m["coral"], col, role="dna_backbone"), root)
    for i in range(0, count, 8):
        a = Vector(left[i])
        b = Vector(right[i])
        rung = curve_tube(f"HELIX_BASE_PAIR_{i//8+1:02d}", [a, b], 0.018, m["gold" if (i // 8) % 2 else "white"], col, role="base_pair")
        parent_keep_world(rung, root)
        parent_keep_world(sphere(f"HELIX_BASE_A_{i//8+1:02d}", a, 0.065, m["cyan"], col, role="base_marker"), root)
        parent_keep_world(sphere(f"HELIX_BASE_B_{i//8+1:02d}", b, 0.065, m["coral"], col, role="base_marker"), root)
    return col


def setup_camera_and_lights(m: dict[str, bpy.types.Material]) -> None:
    bpy.ops.object.camera_add(location=(11.8, -15.5, 10.5))
    camera = bpy.context.object
    camera.name = "CAMERA_MASTER_ORBIT"
    camera.data.lens = 52
    camera.data.sensor_width = 36
    direction = Vector((0.0, 0.25, 1.1)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    tag(camera, "master_camera", "SCENE_CONTROL")
    for name, location, energy, size, color in (
        ("KEY", (-5.0, -6.0, 11.0), 1300, 5.0, (0.84, 0.96, 1.0)),
        ("RIM", (8.0, 3.0, 8.0), 1050, 4.0, (0.35, 0.75, 1.0)),
        ("FILL", (0.0, 8.0, 6.0), 700, 4.0, (1.0, 0.65, 0.35)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = f"LIGHT_{name}"
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        direction = Vector((0.0, 0.3, 1.0)) - light.location
        light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        tag(light, "scene_light", "SCENE_CONTROL")
    world = bpy.context.scene.world
    world.color = (0.008, 0.018, 0.022)
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.008, 0.018, 0.022, 1.0)
        bg.inputs["Strength"].default_value = 0.2


def bounds_for(objects: Iterable[bpy.types.Object], origin: Vector | None = None) -> dict[str, list[float]]:
    corners: list[Vector] = []
    for obj in objects:
        if obj.type == "MESH":
            corners.extend(obj.matrix_world @ Vector(corner) - (origin or Vector()) for corner in obj.bound_box)
        elif obj.type == "CURVE":
            for spline in obj.data.splines:
                for point in spline.points:
                    corners.append(obj.matrix_world @ Vector(point.co[:3]) - (origin or Vector()))
    if not corners:
        return {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0], "size": [0.0, 0.0, 0.0]}
    low = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    high = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    size = high - low
    return {"min": list(low), "max": list(high), "size": list(size)}


def collection_objects(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    def walk(col: bpy.types.Collection) -> None:
        objects.extend(col.objects)
        for child in col.children:
            walk(child)
    walk(collection)
    return objects


def export_glb(
    path: Path,
    objects: Sequence[bpy.types.Object] | None = None,
    *,
    normalize_origin: Vector | None = None,
) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    if objects is not None:
        for obj in objects:
            if obj.name in bpy.context.view_layer.objects:
                obj.select_set(True)
        if objects:
            bpy.context.view_layer.objects.active = objects[0]
    saved_matrices: dict[bpy.types.Object, Matrix] = {}
    if normalize_origin is not None and objects is not None:
        offset = Matrix.Translation(-normalize_origin)
        for obj in objects:
            saved_matrices[obj] = obj.matrix_world.copy()
            obj.matrix_world = offset @ saved_matrices[obj]
        bpy.context.view_layer.update()
    try:
        kwargs = {
            "filepath": str(path),
            "export_format": "GLB",
            "use_selection": objects is not None,
            "export_apply": True,
            "export_animations": False,
            "export_materials": "EXPORT",
            "export_cameras": False,
            "export_lights": False,
        }
        bpy.ops.export_scene.gltf(**kwargs)
    finally:
        if saved_matrices:
            for obj, matrix in saved_matrices.items():
                obj.matrix_world = matrix
            bpy.context.view_layer.update()


def write_outputs(collections: dict[str, bpy.types.Collection]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_glb(COMBINED_GLB)
    manifest: dict[str, object] = {
        "schema": "rainbow.dna-storage.assets/v2",
        "version": VERSION,
        "units": "meter",
        "coordinateSystem": "Blender Z-up, right-handed",
        "fps": FPS,
        "blend": BLEND_PATH.name,
        "combinedGlb": COMBINED_GLB.name,
        "assets": {},
    }
    assets: dict[str, object] = {}
    for key, collection in collections.items():
        objects = collection_objects(collection)
        path = OUT_DIR / f"{key}.glb"
        roots = [obj for obj in objects if obj.get("asset_role") == "asset_root"]
        origin = roots[0].matrix_world.translation.copy() if roots else Vector((0.0, 0.0, 0.0))
        export_glb(path, objects, normalize_origin=origin)
        assets[key] = {
            "collection": collection.name,
            "glb": path.name,
            "objectCount": len(objects),
            "bounds": bounds_for(objects, origin),
            "worldOrigin": list(origin),
            "roles": sorted({str(obj.get("asset_role", "unknown")) for obj in objects}),
            "source": "procedural Blender bpy",
        }
    manifest["assets"] = assets
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"blend": str(BLEND_PATH), "combinedGlb": str(COMBINED_GLB), "manifest": str(MANIFEST_PATH), "assets": list(assets)}, ensure_ascii=False))


def main() -> None:
    clear_scene()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.length_unit = "METERS"
    bpy.context.scene.unit_settings.scale_length = 1.0
    # Blender 4.x/5.x expose the real-time engine under different enum names.
    available_engines = {item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in available_engines else "BLENDER_EEVEE"
    bpy.context.scene.render.resolution_x = 1920
    bpy.context.scene.render.resolution_y = 1080
    bpy.context.scene.render.resolution_percentage = 40
    bpy.context.scene.render.fps = FPS
    materials = build_materials()
    lab_environment = build_lab_environment(materials)
    collections = {
        "lab_environment": lab_environment,
        "microfluidic_chip": build_microfluidic_chip(materials),
        "sequencing_flowcell": build_sequencing_flowcell(materials),
        "dna_droplet": build_droplet(materials),
        "dna_double_helix": build_double_helix(materials),
    }
    setup_camera_and_lights(materials)
    write_outputs(collections)


if __name__ == "__main__":
    main()
