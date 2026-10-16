"""Promote an independently audited CFD surface export into the film.

The script is intentionally conservative: a postprocessed VTU can be copied
only after the producing audit has set ``quality.acceptedForFilm``.  It never
turns a nonconverged snapshot into an accepted result and never rewrites the
quality flag itself.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, required=True,
                    help="surface-loads.json produced by the CFD postprocessor")
    ap.add_argument("--output", type=Path,
                    default=Path("public/physics/computed-pressure.json"))
    args = ap.parse_args()
    source = args.source.resolve()
    data = json.loads(source.read_text(encoding="utf-8"))
    quality = data.get("quality", {})
    if quality.get("acceptedForFilm") is not True:
        raise SystemExit(
            "Refusing promotion: quality.acceptedForFilm is not true. "
            "Finish residual, force, y+ and geometry audits first."
        )
    geometry = data.get("surfaceGeometry")
    if not isinstance(geometry, dict):
        raise SystemExit("Missing surfaceGeometry in CFD export")
    required = ("points_m", "triangles", "cp", "outward_normals")
    if any(k not in geometry for k in required):
        raise SystemExit("CFD export lacks the geometry/Cp/normal arrays")
    if geometry.get("normalConvention") != "body-outward":
        raise SystemExit("CFD export normals are not body-outward")
    if data.get("coordinates") != "CFD_Z_UP":
        raise SystemExit("CFD source axes must be explicitly CFD_Z_UP")
    count = len(geometry["points_m"])
    def finite3(value):
        return (isinstance(value, list) and len(value) == 3
                and all(isinstance(v, (int, float)) and math.isfinite(v) for v in value))
    if not count or not all(finite3(p) for p in geometry["points_m"]):
        raise SystemExit("Invalid boundary points")
    if (len(geometry["outward_normals"]) != count
            or not all(finite3(n) and abs(math.hypot(*n) - 1) < 1e-6
                       for n in geometry["outward_normals"])):
        raise SystemExit("Pressure export requires one outward unit normal per point")
    if (len(geometry["cp"]) != count
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in geometry["cp"])):
        raise SystemExit("Pressure export requires one finite Cp per point")
    if not geometry["triangles"] or not all(
            isinstance(t, list) and len(t) == 3
            and all(isinstance(i, int) and 0 <= i < count for i in t)
            for t in geometry["triangles"]):
        raise SystemExit("Invalid boundary triangle connectivity")
    # SU2 uses X/Y horizontal and Z vertical; the film uses Three.js X/Z
    # horizontal and Y up. This is a proper orientation-preserving conversion
    # (x, y, z) -> (x, z, -y), applied to points and outward normals alike.
    def to_three(v: list[float]) -> list[float]:
        return [v[0], v[2], -v[1]]

    points = [to_three(v) for v in geometry["points_m"]]
    normals = [to_three(v) for v in geometry["outward_normals"]]
    result = {
        "schema": "rainbow.computed-boundary-pressure/1",
        "coordinates": "metres, Three.js XYZ, Y up",
        "normalConvention": "body-outward",
        "points_m": points,
        "triangles": geometry["triangles"],
        "cp": geometry["cp"],
        "outward_normals": normals,
        "pressure_Pa": geometry.get("pressure_Pa"),
        "provenance": {
            **data.get("provenance", {}),
            "sourceSurfaceLoads": str(source),
            "sourceSchema": data.get("schema"),
        },
        "quality": quality,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Promoted accepted CFD pressure field: {args.output}")


if __name__ == "__main__":
    main()
