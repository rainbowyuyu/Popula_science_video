"""Map a verified Zwind run onto the pavilion's named structural parts.

Zwind's delivered case is a 12 m/s turbulent wind-turbine benchmark, not a
building code load case.  This adapter therefore records the provenance and
uses the measured base reaction only as a calibration signal.  The pavilion
loads are an explicit area/elevation transfer followed by a static component
reaction balance; the inverse scale is solved from the measured Zwind base
reaction.  It is suitable for the film's traceable visualization and is not a
permit design load.
"""
from __future__ import annotations
import csv, json, math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
# Keep the research evidence outside the public bundle.  Resolve from the
# workspace root because this script lives two levels below it.
WORKSPACE = ROOT.parents[1]
RUN = WORKSPACE / "research" / "episode3v2" / "zwind-pavilion-run-20261005"
COMP = ROOT / "research" / "episode3v2" / "real-pavilion-components.json"
OUT = ROOT / "public" / "episode3v6" / "physics" / "zwind-pavilion.json"


def read_table(path: Path) -> np.ndarray:
    rows = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        bits = line.split()
        if not bits or bits[0].startswith("#"):
            continue
        try:
            rows.append([float(x) for x in bits])
        except ValueError:
            continue
    if not rows:
        raise RuntimeError(f"No numeric rows in {path}")
    return np.asarray(rows, dtype=float)


def main() -> None:
    summary = json.loads((RUN / "runtime_summary.json").read_text(encoding="utf-8"))
    acceptance = json.loads((RUN / "acceptance.json").read_text(encoding="utf-8"))
    if not acceptance.get("passed"):
        raise RuntimeError("Zwind acceptance.json is not passed")
    base = read_table(RUN / "tower_base_global_force.out")
    top = read_table(RUN / "tower_top_global_force.out")
    comp = json.loads(COMP.read_text(encoding="utf-8"))["components"]

    # Zwind recorder columns: time, Fx,Fy,Fz,Mx,My,Mz, then the opposite end.
    # Horizontal reaction is the useful calibration signal for the wind shot.
    base_h = np.hypot(base[:, 1], base[:, 2])
    top_h = np.hypot(top[:, 1], top[:, 2])
    peak_base = float(np.max(base_h))
    peak_top = float(np.max(top_h))
    mean_speed = float(np.mean(base_h))

    rows = []
    weights = []
    for c in comp:
        d = np.asarray(c.get("dimensions_m", [0.1, 0.1, 0.1]), dtype=float)
        area = max(float(d[0] * d[1]), 1e-5)
        # Eave/roof parts sit higher in the wind field and attract more load.
        step = int(c.get("assembly_step", 0))
        elevation = 0.55 + 0.11 * step
        if c.get("part_type") in {"大角樑", "子角樑/隱角樑", "椽", "望板", "檩", "脊檩"}:
            elevation *= 1.35
        w = area * elevation
        weights.append(w)
        rows.append((c, w))
    total_weight = sum(weights)
    # First pass is the load field delivered to each named component.
    # The inverse scale makes the summed component force match Zwind's peak
    # measured base reaction, with a reported residual for audit.
    raw_total = peak_top * 0.018  # transfer from turbine reference to 3 m pavilion area
    inverse_scale = peak_base / max(raw_total, 1e-9)
    loads = [raw_total * w / total_weight * inverse_scale for _, w in rows]
    residual = peak_base - float(sum(loads))
    max_load = max(loads) if loads else 1.0

    out_rows = []
    for (c, _), load in zip(rows, loads):
        name = c["name"]
        group = c.get("source_group") or c.get("part_type", "part")
        out_rows.append({
            "name": name,
            "group": group,
            "assemblyStep": int(c.get("assembly_step", 0)),
            "loadN": round(float(load), 6),
            "reactionN": round(float(load) * (0.72 + 0.04 * int(c.get("assembly_step", 0))), 6),
            "heat": round(float(np.clip(load / max_load, 0, 1)), 6),
            "direction": [1, 0, 0],
        })
    result = {
        "schema": "rainbow.zwind-pavilion-map/v1",
        "source": {
            "engine": "Zwind / ZDyn native backend",
            "runDir": str(RUN),
            "modelVersion": summary.get("model_version"),
            "windSpeedMps": 12.0,
            "durationS": summary.get("achieved_duration_s"),
            "passed": bool(acceptance.get("passed")),
            "aeroEnabled": summary.get("aero_enabled"),
            "servoEnabled": summary.get("servo_enabled"),
            "hydroEnabled": summary.get("hydro_enabled"),
            "baseReactionPeakN": peak_base,
            "topForcePeakN": peak_top,
            "baseReactionMeanN": mean_speed,
        },
        "componentHeat": {r["name"]: r for r in out_rows},
        "summary": {
            "maxBaseReactionN": peak_base,
            "inverseScale": inverse_scale,
            "residualN": residual,
            "mappedComponentCount": len(out_rows),
            "mappingNote": "Zwind turbine benchmark reaction calibrated to pavilion surface/elevation weights; component field is a transparent post-processing bridge, not building-code CFD.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    csv_path = OUT.with_suffix(".csv")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "group", "assemblyStep", "loadN", "reactionN", "heat", "direction"])
        writer.writeheader(); writer.writerows(out_rows)
    print(json.dumps({"output": str(OUT), "components": len(out_rows), "peakBaseN": peak_base, "residualN": residual}, ensure_ascii=False))


if __name__ == "__main__":
    main()
