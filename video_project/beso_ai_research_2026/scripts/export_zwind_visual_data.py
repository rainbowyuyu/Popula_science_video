"""Export saved native Zwind response data; no solver is invoked by this exporter."""
from __future__ import annotations

import hashlib
import json
import ast
import math
from pathlib import Path

import numpy as np

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"D:\python_project\beso_ai")
RUN = SOURCE / "runs/zwind_campaign_full_v7/mw_20/seed_17"
OUT = PROJECT / "public/beso-research/physics"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(name: str) -> np.ndarray:
    result = np.loadtxt(RUN / name)
    assert result.ndim == 2 and np.isfinite(result).all()
    assert (np.diff(result[:, 0]) > 0).all(), name
    return result


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    result = json.loads((RUN / "native_result.json").read_text(encoding="utf-8"))
    completion = json.loads((RUN / "native_run_complete.json").read_text(encoding="utf-8"))
    assert result["native_complete"] and completion["completed"]
    platform = read("platform_disp.out")
    tower = read("tower_top_disp.out")
    mooring = read("mooring_fairlead_tension.out")
    assert len(platform) == len(tower) == len(mooring) == 12000
    assert np.allclose(platform[:, 0], tower[:, 0]) and np.allclose(platform[:, 0], mooring[:, 0])
    ids = np.unique(np.r_[np.arange(0, len(platform), 10), len(platform) - 1])
    records = []
    for i in ids:
        records.append({
            "t": round(float(platform[i, 0]), 3),
            "platform": [round(float(v), 8) for v in platform[i, 1:7]],
            "towerTop": [round(float(v), 8) for v in tower[i, 1:7]],
            "mooringTensionN": [round(float(v), 3) for v in mooring[i, 1:]],
        })
    named_files = ["platform_disp.out", "tower_top_disp.out", "mooring_fairlead_tension.out", "native_result.json", "native_run_complete.json"]
    payload = {
        "schema": "native-zwind-visual-response-v1",
        "sourceRun": str(RUN),
        "evidenceType": "saved_native_probe",
        "sourceTitle": "20 MW Zwind native probe / seed 17 / 120 s",
        "screenLabel": "Zwind 原始输出回放 · 伺服关闭",
        "claimBoundary": "Saved 20 MW aero-hydro-mooring probe with Servo disabled. Separate native geometry and run; not a coupled validation of BESO9 seed17 topology or paper Fig.2 design acceptance.",
        "servoEnabled": result["servo_enabled"],
        "solverProfile": result["solver_profile"],
        "sourceDtS": 0.01,
        "displayDtS": 0.1,
        "durationS": 120.0,
        "sourceSamples": len(platform),
        "dofColumns": ["surge_m", "sway_m", "heave_m", "roll_rad", "pitch_rad", "yaw_rad"],
        "coordinateMapping": "Native (x,y,z), z up -> Three (x,z,-y). Translations map [d0,d2,-d1]. Rotation-vector components map [d3,d5,-d4]. Camera motion is editorial; response values are original.",
        "displayGain": 1,
        "sourceHashes": {f: digest(RUN / f) for f in named_files},
        "platformAbsMax": [round(float(v), 8) for v in np.abs(platform[:, 1:7]).max(axis=0)],
        "towerTopAbsMax": [round(float(v), 8) for v in np.abs(tower[:, 1:7]).max(axis=0)],
        "records": records,
    }
    (OUT / "zwind-response.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for source, name in [
        (SOURCE / "third_party/zwind_newmodel/optimized_geometry30.json", "zwind-geometry.json"),
        (SOURCE / "third_party/zwind_newmodel/paper_fig2_metrics.json", "paper-metrics.json"),
    ]:
        (OUT / name).write_bytes(source.read_bytes())
    # Match the actual run's source, rather than the older fitted CAD metadata.
    native_source = SOURCE / "third_party/zwind_newmodel/test0820_hardcode.py"
    assert digest(native_source) == result["metadata"]["source_sha256"]
    syntax = ast.parse(native_source.read_text(encoding="utf-8-sig"))
    constants = {}
    for statement in syntax.body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
            try:
                constants[statement.targets[0].id] = ast.literal_eval(statement.value)
            except (ValueError, TypeError):
                pass
    nodes = {1: [0.0, 0.0, constants["Z_TOP"]]}
    elements = []
    for i, angle in enumerate(constants["ANGLES_DEG"]):
        c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
        top, bottom, hub = (i+4)*10+1, (i+4)*10+2, 811+i
        nodes[top] = [constants["R_TOP"]*c, constants["R_TOP"]*s, constants["Z_TOP"]]
        nodes[bottom] = [constants["R_BOT"]*c, constants["R_BOT"]*s, constants["Z_BOT"]]
        nodes[hub] = [constants["R_HUB"]*c, constants["R_HUB"]*s, constants["Z_TOP"]]
        elements.extend([
            {"id": 101+i, "from": top, "to": bottom, "diameterM": constants["D_OUTER"][i], "role": "outer_column"},
            {"id": 104+i, "from": hub, "to": bottom, "diameterM": constants["D_INNER"][i], "role": "inner_leg"},
            {"id": 9000+i, "from": 1, "to": hub, "widthM": math.pi*constants["R_HUB"]/3, "heightM": constants["H_PLATE"], "role": "hub_radial_box_beam"},
        ])
    native_model = {
        "schema": "native-zwind-geometry-v1", "units": "m", "upAxis": "z",
        "source": str(native_source), "sourceSHA256": digest(native_source),
        "matchesRunSourceHash": True, "nodes": nodes, "elements": elements,
        "wallThicknessM": constants["T_wall"],
        "hub": {"radiusM": constants["R_HUB"], "heightM": constants["H_PLATE"], "zM": constants["Z_TOP"]},
        "tower": {"baseZM": constants["Z_TOP"], "lengthM": constants["Height"], "topNodeId": 144, "sectionNote": "Render skin is illustrative; solver source uses equivalent beam stiffness."},
        "rotor": {"hubX": -1.9, "hubZM": constants["Height"]+1.75+constants["Z_TOP"], "bladeLengthM": 131.0, "visualizationNote": "Blade skin is illustrative; platform and tower motion reads saved native nodes."},
        "mooringPolylines": [{"line": i, "nativeXYZ": list(map(list, zip(constants[f"x_coords_{i*1000}"], constants[f"y_coords_{i*1000}"], constants[f"z_coords_{i*1000}"])))} for i in range(1,13)],
    }
    (OUT / "native-model.json").write_text(json.dumps(native_model, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({k: payload[k] for k in ["screenLabel", "sourceSamples", "platformAbsMax", "towerTopAbsMax"]}, ensure_ascii=False))
    print("Exported", len(records), "native samples to", OUT)


if __name__ == "__main__":
    main()
