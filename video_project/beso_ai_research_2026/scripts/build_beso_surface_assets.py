"""Convert saved BESO tetrahedral states to reproducible Three.js surface assets.

No remeshing or smoothing is applied: each triangle is an exposed face of a
solid tetrahedron in the native VTK.  Source geometry is shared between frames.
The source millimetres / z-up convention is transformed to metres / y-up.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


DEFAULT_SOURCE = Path(r"D:\python_project\beso_ai\runs\beso9_centered_seed_campaign_v4\mw_20\seed_17\beso_run")
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "public/beso-research/geometry"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_vtk(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    def row(prefix):
        return next(i for i, line in enumerate(lines) if line.startswith(prefix))
    ip = row("POINTS ")
    ic = row("CELLS ")
    it = row("CELL_TYPES ")
    idata = row("CELL_DATA ")
    point_count = int(lines[ip].split()[1])
    cell_count = int(lines[ic].split()[1])
    points = np.fromstring(" ".join(lines[ip + 1:ic]), sep=" ").reshape(point_count, 3)
    cells_with_count = np.fromstring(" ".join(lines[ic + 1:it]), dtype=np.int32, sep=" ").reshape(cell_count, 5)
    types = np.fromstring(" ".join(lines[it + 1:idata]), dtype=np.int32, sep=" ")
    if not np.all(cells_with_count[:, 0] == 4) or not np.all(types == 10):
        raise ValueError("Expected tetrahedral VTK only")
    scalar = {}
    markers = [i for i, line in enumerate(lines) if line.startswith(("SCALARS ", "POINT_DATA "))]
    for start, end in zip(markers, markers[1:]):
        if not lines[start].startswith("SCALARS "):
            continue
        key = lines[start].split()[1]
        values = np.fromstring(" ".join(lines[start + 2:end]), sep=" ")
        if len(values) != cell_count:
            raise ValueError(f"Unexpected array length for {key}: {len(values)}")
        scalar[key] = values
    return {"points": points, "cells": cells_with_count[:, 1:], "scalar": scalar}


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def build(source: Path, out: Path, iterations: list[int]):
    first = parse_vtk(source / f"file{iterations[0]:03d}.vtk")
    points = first["points"]
    cells = first["cells"]
    minimum, maximum = points.min(axis=0), points.max(axis=0)
    center = (minimum + maximum) / 2
    render_points = (points - center)[:, [0, 2, 1]] / 1000
    render_points[:, 2] *= -1

    # Face winding is outward relative to its tetrahedron, before axis mapping.
    face_local = np.array([[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]])
    opposite_local = np.array([3, 2, 1, 0])
    faces = cells[:, face_local].reshape(-1, 3).copy()
    opposite = cells[:, opposite_local].ravel()
    a, b, c = points[faces[:, 0]], points[faces[:, 1]], points[faces[:, 2]]
    inward = np.einsum("ij,ij->i", np.cross(b - a, c - a), points[opposite] - a) > 0
    faces[inward] = faces[inward][:, [0, 2, 1]]
    face_keys = np.sort(faces, axis=1)
    _, inverse, counts = np.unique(face_keys, axis=0, return_inverse=True, return_counts=True)
    if np.any(counts > 2):
        raise ValueError("Non-manifold source mesh")
    owner = np.repeat(np.arange(len(cells)), 4)
    tetra = points[cells]
    cell_volume = np.abs(np.einsum("ij,ij->i", np.cross(tetra[:, 1]-tetra[:, 0], tetra[:, 2]-tetra[:, 0]), tetra[:, 3]-tetra[:, 0])) / 6
    if np.any(cell_volume <= 0):
        raise ValueError("Zero-volume tetrahedron")

    write_json(out / "shared.json", {
        "schema": "beso-surface-shared-v1",
        "positions": np.round(render_points, 6).ravel().tolist(),
        "pointCount": len(points), "cellCount": len(cells),
        "sourceBoundsMm": {"min": minimum.tolist(), "max": maximum.tolist()},
        "sourceCenterMm": center.tolist(),
        "renderBoundsM": {"min": render_points.min(axis=0).tolist(), "max": render_points.max(axis=0).tolist()},
        "mapping": "render_xyz = (source_x-center_x, source_z-center_z, -(source_y-center_y))/1000",
        "sourceUnits": "millimetres", "renderUnits": "metres", "originalUpAxis": "Z", "renderUpAxis": "Y",
    })
    manifest = {
        "schema": "beso-surface-manifest-v1", "sourceDirectory": str(source),
        "shared": "shared.json", "iterations": [],
        "method": "Native solid-cell boundary extraction; no invented geometry or topology interpolation.",
        "heat": "FI_max from native source; display scalar is percentile-normalized per frame (not a common quantitative scale).",
        "volumeFractionNote": "solidVolumeFraction weights each tetrahedron by its native volume; solidCellFraction is only a cell-count fraction.",
        "meshSha256": hashlib.sha256(points.tobytes()+cells.tobytes()).hexdigest(),
    }
    for iteration in iterations:
        path = source / f"file{iteration:03d}.vtk"
        data = first if iteration == iterations[0] else parse_vtk(path)
        if not np.array_equal(data["cells"], cells) or not np.array_equal(data["points"], points):
            raise ValueError(f"Mesh changed at {iteration}")
        solid = data["scalar"]["element_states"] > 0.5
        solid_face = solid[owner]
        solid_neighbors = np.bincount(inverse, weights=solid_face, minlength=len(counts))
        visible = solid_face & (solid_neighbors[inverse] == 1)
        fi = data["scalar"].get("FI_max", np.zeros(len(cells)))
        low, high = np.quantile(fi[solid], [0.05, 0.95])
        normalized = np.clip((fi - low) / max(high-low, 1e-30), 0, 1)
        name = f"state-{iteration:03d}.json"
        entry = {
            "iteration": iteration, "file": name,
            "solidCount": int(solid.sum()), "cellCount": len(cells),
            "solidCellFraction": float(solid.mean()),
            "solidVolumeFraction": float(cell_volume[solid].sum()/cell_volume.sum()),
            "surfaceTriangleCount": int(visible.sum()),
            "nativeFileSha256": sha256(path),
            "fiMaxRange": [float(fi[solid].min()), float(fi[solid].max())],
            "heatQuantileRange": [float(low), float(high)],
        }
        write_json(out / name, {
            "schema": "beso-surface-state-v1", **entry,
            "indices": faces[visible].ravel().tolist(),
            "faceOwner": owner[visible].tolist(),
            "faceHeat": np.round(normalized[owner[visible]] * 255).astype(np.uint8).tolist(),
        })
        manifest["iterations"].append(entry)
        print(f"{iteration:03d}: {solid.sum():,} solid cells, {visible.sum():,} surface faces, volume fraction {entry['solidVolumeFraction']:.4f}")
    write_json(out / "manifest.json", manifest)
    return manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--iterations", type=int, nargs="+", default=[0, 10, 26, 43])
    args = ap.parse_args()
    build(args.source, args.out, args.iterations)


if __name__ == "__main__":
    main()
