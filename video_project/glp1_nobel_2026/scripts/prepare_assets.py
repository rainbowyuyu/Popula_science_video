"""Export existing reference anatomy and deposited 5VAI coordinates for rendering.

No anatomy synthesis, coordinate deformation, loop rebuilding, or MD is performed.
Anatomy export uses only the standard library. Molecular analysis uses numpy/scipy.
"""
from __future__ import annotations

import argparse
from array import array
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
SOURCE = WORKSPACE / "human-atlas-audit/ashemag-human-atlas-1c38bf3"
SOURCE_COMMIT = "1c38bf35c254a891200d3cedecfd57abebe83d8d"
ATTRIBUTION = "BodyParts3D, © The Database Center for Life Science; CC BY 4.0. Human Atlas application © ashemag, MIT. Selected, regrouped, and restyled for rainbow鱼 educational video."


def write_json(path, data, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=None if compact else 2,
                               separators=(",", ":") if compact else None), encoding="utf-8")


def summary(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return {"bounds": [lo, hi], "center": [(lo[i] + hi[i]) / 2 for i in range(3)],
            "size": [hi[i] - lo[i] for i in range(3)]}


class GLB:
    """Adapted from the preceding hypertension BodyParts3D conversion.

    Float32 source positions and triangle indices are copied without alteration.
    Each source part stays a named mesh to permit scientifically legible cutaways.
    """

    def __init__(self, name, color, opacity=1):
        self.data = bytearray()
        self.doc = {"asset": {"version": "2.0", "generator": "GLP-1 reference asset converter",
                              "copyright": ATTRIBUTION},
                    "scene": 0, "scenes": [{"nodes": [0]}],
                    "nodes": [{"name": name, "children": []}],
                    "meshes": [], "accessors": [], "bufferViews": [],
                    "materials": [{"name": name, "doubleSided": True,
                                   "pbrMetallicRoughness": {"baseColorFactor": color + [opacity],
                                                           "metallicFactor": 0, "roughnessFactor": .46}}],
                    "extras": {"coordinateSystem": "meters, Y-up, subject-left +X, anterior +Z",
                               "source": "https://github.com/ashemag/human-atlas", "commit": SOURCE_COMMIT,
                               "license": "CC BY 4.0", "anatomicalCoordinatesUnchanged": True}}
        if opacity < 1:
            self.doc["materials"][0]["alphaMode"] = "BLEND"

    def accessor(self, raw, component_type, count, kind, target, bounds=None):
        self.data.extend(b"\0" * (-len(self.data) % 4))
        view = len(self.doc["bufferViews"])
        self.doc["bufferViews"].append({"buffer": 0, "byteOffset": len(self.data),
                                        "byteLength": len(raw), "target": target})
        self.data.extend(raw)
        record = {"bufferView": view, "componentType": component_type, "count": count, "type": kind}
        if bounds:
            record.update({"min": bounds[0], "max": bounds[1]})
        result = len(self.doc["accessors"])
        self.doc["accessors"].append(record)
        return result

    def part(self, part, chunk, material=0):
        count = part["vertexCount"]
        pos = array("f")
        pos.frombytes(chunk[part["positions"]:part["positions"] + count * 12])
        normal16 = array("h")
        normal16.frombytes(chunk[part["normals"]:part["normals"] + count * 6])
        normal = array("f", (max(-1, n / 32767) for n in normal16))
        index_bytes = chunk[part["indices"]:part["indices"] + part["indexCount"] * 4]
        indices = array("I")
        indices.frombytes(index_bytes)
        assert max(indices) < count, part["id"]
        assert len(indices) % 3 == 0, part["id"]
        assert all(math.isfinite(v) for v in pos), part["id"]
        info = summary(list(zip(pos[::3], pos[1::3], pos[2::3])))
        pa = self.accessor(pos.tobytes(), 5126, count, "VEC3", 34962, info["bounds"])
        na = self.accessor(normal.tobytes(), 5126, count, "VEC3", 34962)
        ia = self.accessor(index_bytes, 5125, len(indices), "SCALAR", 34963)
        mesh = len(self.doc["meshes"])
        name = part["id"] + "_" + part["name"].replace(" ", "_")
        self.doc["meshes"].append({"name": name, "primitives": [{"attributes": {"POSITION": pa, "NORMAL": na},
                                                                 "indices": ia, "material": material}]})
        node = len(self.doc["nodes"])
        self.doc["nodes"].append({"name": name, "mesh": mesh,
                                  "extras": {"sourceID": part["id"], "sourceName": part["name"], **info}})
        self.doc["nodes"][0]["children"].append(node)

    def save(self, path):
        self.data.extend(b"\0" * (-len(self.data) % 4))
        self.doc["buffers"] = [{"byteLength": len(self.data)}]
        doc_bytes = json.dumps(self.doc, ensure_ascii=False, separators=(",", ":")).encode()
        doc_bytes += b" " * (-len(doc_bytes) % 4)
        total = 12 + 8 + len(doc_bytes) + 8 + len(self.data)
        raw = struct.pack("<4sII", b"glTF", 2, total)
        raw += struct.pack("<I4s", len(doc_bytes), b"JSON") + doc_bytes
        raw += struct.pack("<I4s", len(self.data), b"BIN\0") + self.data
        path.write_bytes(raw)
        return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def anatomy(source):
    atlas = json.loads((source / "public/models/atlas.json").read_text(encoding="utf-8"))
    parts = {p["id"]: p for p in atlas["parts"]}
    concepts = {c["id"]: c for c in atlas["concepts"]}
    chunks = [(source / "public/models" / Path(c["url"]).name).read_bytes() for c in atlas["chunks"]]
    brain_cavities = set(concepts["FMA242787"]["elements"])
    specs = {
        "body": (["FJ2810"], "#B5C8D1", .1),
        "stomach": (["FJ2564"], "#E49B85", 1),
        "esophagus": (["FJ2563"], "#C88D7D", 1),
        "small_intestine": (concepts["FMA7200"]["elements"], "#D9AE86", 1),
        # Pancreas exterior and parenchyma are near-identical overlapping surfaces.
        "pancreas": (["FJ1895"], "#E8C66E", 1),
        "liver": ([f"FJ{i}" for i in [2816, 2818, 2819, 2820, 2821, 2822, 2823, 2824]], "#A96765", 1),
        "brain": ([p for p in concepts["FMA50801"]["elements"] if p not in brain_cavities], "#CEC1B3", 1),
        "heart": ([f"FJ{i}" for i in range(2417, 2440) if f"FJ{i}" in parts], "#C45E67", 1),
        "aorta": (["FJ3411", "FJ3413", "FJ3427"], "#CD6871", 1),
        # Keep individual names; these are reference vessels, not a complete vascular tree.
        "veins": (["FJ1853", "FJ1893", "FJ1913", "FJ1914", "FJ2414", "FJ2415", "FJ2416",
                   "FJ3441", "FJ3443", "FJ3641", "FJ3645", "FJ3647", "FJ3659"], "#699EB7", 1),
        "pancreatic_ducts": (["FJ1896", "FJ2630"], "#E7DCA0", 1),
    }
    out = ROOT / "public/models"
    out.mkdir(parents=True, exist_ok=True)
    assets = {}
    for name, (ids, color, opacity) in specs.items():
        selected = [parts[i] for i in ids]
        rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        glb = GLB(name, rgb, opacity)
        for p in selected:
            glb.part(p, chunks[p["chunk"]])
        metadata = glb.save(out / (name + ".glb"))
        points = [b for node in glb.doc["nodes"] if "extras" in node for b in node["extras"]["bounds"]]
        assets[name] = {"path": "models/" + name + ".glb", **metadata, **summary(points),
                        "sourceIDs": ids, "parts": [{"id": p["id"], "name": p["name"]} for p in selected],
                        "meshCount": len(selected), "vertices": sum(p["vertexCount"] for p in selected),
                        "triangles": sum(p["indexCount"] // 3 for p in selected),
                        "sourceRepository": "https://github.com/ashemag/human-atlas", "sourceCommit": SOURCE_COMMIT,
                        "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"}
    shutil.copyfile(out / "body.glb", out / "skin.glb")
    assets["skin"] = {**assets["body"], "path": "models/skin.glb", "aliasOf": "body"}
    manifest = {
        "schemaVersion": 1, "dataset": "BodyParts3D 4.0 adult male reference anatomy",
        "attribution": ATTRIBUTION, "sourceRepository": "https://github.com/ashemag/human-atlas",
        "sourceCommit": SOURCE_COMMIT, "sourceArchive": "isa_BP3D_4.0_obj_99.zip",
        "dataLicense": "https://creativecommons.org/licenses/by/4.0/",
        "dataPublication": "https://doi.org/10.1093/nar/gkn613",
        "coordinates": {"units": "meters", "up": "+Y", "subjectLeft": "+X", "anterior": "+Z",
                        "sharedWorldCoordinates": True, "organRecentered": False,
                        "sourcePositionBytesPreserved": True},
        "assets": assets,
        "cameraSuggestions": {
            "wholeBody": {"position": [0, .88, 3.1], "target": [0, .88, 0], "verticalFov": 34},
            "digestive": {"position": [.03, 1.1, .88], "target": [.01, 1.095, .025], "verticalFov": 30},
            "pancreas": {"position": [.13, 1.16, .42], "target": [.012, 1.12, .021], "verticalFov": 28}},
        "notes": [
            "Load all GLBs under the same parent at identity transform. Never center or scale organs individually.",
            "body and skin are aliases: display only one.",
            "Brain cavity meshes are omitted; heart selection excludes wrongly grouped cerebral ventricles.",
            "Heart retains individually named cavity and valve meshes. Hide nodes with Cavity in the name for exterior shots.",
            "Pancreas uses only the outer surface FJ1895; near-overlapping parenchyma FJ2629 is excluded.",
            "The small intestine uses the complete FMA7200 selection: duodenum, jejunum, ileum and ileocecal junction.",
            "Aorta excludes overlapping thoracic and abdominal subdivisions FJ1931/FJ1932.",
            "Veins are selected reference vessel surfaces; capillaries and complete intestinal tributaries are absent.",
            "Cells, hormone particles, physiological flow and tissue transparency are explanatory rendering layers, not source measurements."]}
    write_json(out / "manifest.json", manifest)
    shutil.copyfile(source / "LICENSE", out / "HUMAN_ATLAS_MIT_LICENSE.txt")
    (out / "ATTRIBUTION.md").write_text((source / "public/ATTRIBUTION.md").read_text(encoding="utf-8") +
        "\n\n## GLP-1 video conversion\n\n" + ATTRIBUTION +
        "\n\nSource float32 anatomical positions and original triangle indices were copied directly. Normal quantization was decoded. "
        "Each source part remains a named mesh. No organ deformation, independent recentering, or generative geometry was performed.\n",
        encoding="utf-8")
    return manifest


CHAIN_INFO = {
    "R": {"role": "receptor", "name": "GLP-1 receptor", "organism": "Oryctolagus cuniculus", "labelAsymId": "A", "color": "#63CDC2"},
    "P": {"role": "ligand", "name": "GLP-1(7–37)", "organism": "Homo sapiens", "labelAsymId": "B", "color": "#F0BB68"},
    "A": {"role": "gs_alpha", "name": "Gs alpha", "organism": "Homo sapiens", "labelAsymId": "C", "color": "#9992D8"},
    "B": {"role": "gs_beta", "name": "G beta 1", "organism": "Rattus norvegicus", "labelAsymId": "D", "color": "#6B8CB5"},
    "G": {"role": "gs_gamma", "name": "G gamma 2", "organism": "Bos taurus", "labelAsymId": "E", "color": "#AA92BB"},
    "N": {"role": "nanobody", "name": "Nanobody 35 (experimental stabilizer)", "organism": "Lama glama", "labelAsymId": "F", "color": "#858B96"},
}


def molecules():
    import numpy as np
    from scipy.spatial import cKDTree

    directory = ROOT / "research/structures"
    directory.mkdir(parents=True, exist_ok=True)
    urls = {"5VAI.pdb": "https://files.rcsb.org/download/5VAI.pdb",
            "5VAI.cif": "https://files.rcsb.org/download/5VAI.cif",
            "5VAI-entry.json": "https://data.rcsb.org/rest/v1/core/entry/5VAI"}
    for filename, url in urls.items():
        path = directory / filename
        if not path.exists():
            urllib.request.urlretrieve(url, path)
    lines = (directory / "5VAI.pdb").read_text().splitlines()
    atoms = defaultdict(list)
    helices, sheets, missing, disulfides = [], [], defaultdict(list), []
    for line in lines:
        if line.startswith("ATOM") and line[16] in (" ", "A"):
            atoms[line[21]].append({"serial": int(line[6:11]), "name": line[12:16].strip(),
                "element": line[76:78].strip(), "resname": line[17:20], "resid": int(line[22:26]),
                "insertionCode": line[26].strip(), "position": [float(line[30:38]), float(line[38:46]), float(line[46:54])],
                "occupancy": float(line[54:60]), "bFactor": float(line[60:66])})
        elif line.startswith("HELIX"):
            helices.append({"id": line[11:14].strip(), "chain": line[19], "start": int(line[21:25]),
                            "end": int(line[33:37]), "helixClass": int(line[38:40])})
        elif line.startswith("SHEET"):
            sheets.append({"id": line[11:14].strip(), "strand": int(line[7:10]), "chain": line[21],
                           "start": int(line[22:26]), "end": int(line[33:37]), "sense": int(line[38:40])})
        elif line.startswith("REMARK 465") and line[15:18].strip() and line[19:20] in CHAIN_INFO:
            try:
                missing[line[19]].append({"resname": line[15:18], "resid": int(line[21:26]), "insertionCode": line[26].strip()})
            except ValueError:
                pass
        elif line.startswith("SSBOND"):
            disulfides.append({"chain1": line[15], "resid1": int(line[17:21]),
                                "chain2": line[29], "resid2": int(line[31:35]), "distance": float(line[73:78])})
    chains = []
    covalent = {"C": .76, "N": .71, "O": .66, "S": 1.05, "H": .31}
    for chain, info in CHAIN_INFO.items():
        chain_atoms = atoms[chain]
        residue_atoms = defaultdict(dict)
        for atom in chain_atoms:
            residue_atoms[(atom["resid"], atom["insertionCode"])][atom["name"]] = atom["position"]
        ca = []
        for atom in chain_atoms:
            if atom["name"] != "CA":
                continue
            rid = atom["resid"]
            helix = next((h for h in helices if h["chain"] == chain and h["start"] <= rid <= h["end"]), None)
            sheet = next((s for s in sheets if s["chain"] == chain and s["start"] <= rid <= s["end"]), None)
            backbone = {k: v for k, v in residue_atoms[(rid, atom["insertionCode"])].items() if k in ("N", "CA", "C", "O")}
            ca.append({"resid": rid, "resname": atom["resname"], "position": atom["position"],
                       "insertionCode": atom["insertionCode"],
                       "secondary": "helix" if helix else "sheet" if sheet else "coil",
                       "secondaryId": helix["id"] if helix else sheet["id"] if sheet else None,
                       "backbone": backbone})
        segments, start = [], 0
        for i in range(1, len(ca)):
            dist = math.dist(ca[i - 1]["position"], ca[i]["position"])
            if ca[i]["resid"] != ca[i - 1]["resid"] + 1 or dist > 4.8:
                segments.append({"start": start, "endExclusive": i,
                                 "startResid": ca[start]["resid"], "endResid": ca[i - 1]["resid"]})
                start = i
        segments.append({"start": start, "endExclusive": len(ca), "startResid": ca[start]["resid"], "endResid": ca[-1]["resid"]})
        positions = np.asarray([a["position"] for a in chain_atoms])
        bonds = []
        for i, j in sorted(cKDTree(positions).query_pairs(2.3)):
            a, b = chain_atoms[i], chain_atoms[j]
            threshold = covalent.get(a["element"], .77) + covalent.get(b["element"], .77) + .4
            # Bond inference is only for rendering. No inter-protein bonds are inferred.
            allowed = a["resid"] == b["resid"] or (abs(a["resid"] - b["resid"]) == 1 and {a["name"], b["name"]} == {"C", "N"})
            allowed = allowed or (a["name"] == b["name"] == "SG")
            distance = float(np.linalg.norm(positions[i] - positions[j]))
            if allowed and .4 < distance <= threshold:
                bonds.append([i, j])
        chains.append({"id": chain, "authChainId": chain, **info, "modeledResidues": len(ca),
                       "modeledResidueRange": [ca[0]["resid"], ca[-1]["resid"]],
                       **summary([a["position"] for a in chain_atoms]), "ca": ca, "segments": segments,
                       "atoms": chain_atoms, "inferredCovalentBonds": bonds, "missingResidues": missing[chain]})

    by_chain = {c["id"]: c for c in chains}
    receptor_ca = {a["resid"]: np.array(a["position"]) for a in by_chain["R"]["ca"]}
    # Approximate TM ranges are used only for a convenient rigid display basis.
    tm_ranges = [(137, 169), (174, 211), (224, 257), (261, 292), (304, 338), (345, 375), (379, 403)]
    outward = []
    for index, (start, end) in enumerate(tm_ranges):
        first = np.mean([receptor_ca[r] for r in range(start, start + 4)], axis=0)
        last = np.mean([receptor_ca[r] for r in range(end - 3, end + 1)], axis=0)
        axis = first - last if index % 2 == 0 else last - first
        outward.append(axis / np.linalg.norm(axis))
    y_axis = np.mean(outward, axis=0)
    y_axis /= np.linalg.norm(y_axis)
    center = np.mean([receptor_ca[r] for s, e in tm_ranges for r in range(s, e + 1)], axis=0)
    ligand_center = np.mean([r["position"] for r in by_chain["P"]["ca"]], axis=0)
    z_axis = ligand_center - center
    z_axis -= y_axis * np.dot(z_axis, y_axis)
    z_axis /= np.linalg.norm(z_axis)
    x_axis = np.cross(y_axis, z_axis)
    rotation = np.stack([x_axis, y_axis, z_axis])
    all_ca = np.asarray([r["position"] for c in chains if c["id"] != "N" for r in c["ca"]])
    display_positions = (all_ca - center) @ rotation.T
    receptor_atoms = by_chain["R"]["atoms"]
    ligand_atoms = by_chain["P"]["atoms"]
    r_xyz = np.array([a["position"] for a in receptor_atoms])
    p_xyz = np.array([a["position"] for a in ligand_atoms])
    distances, nearest = cKDTree(r_xyz).query(p_xyz)
    residue_contacts = {}
    for pi, candidates in enumerate(cKDTree(r_xyz).query_ball_point(p_xyz, 4.5)):
        for ri in candidates:
            p, r = ligand_atoms[pi], receptor_atoms[ri]
            key = (p["resid"], r["resid"])
            distance = float(np.linalg.norm(p_xyz[pi] - r_xyz[ri]))
            if key not in residue_contacts or distance < residue_contacts[key]["distanceAngstrom"]:
                residue_contacts[key] = {"ligandResid": p["resid"], "ligandResname": p["resname"],
                    "receptorResid": r["resid"], "receptorResname": r["resname"],
                    "ligandAtom": p["name"], "receptorAtom": r["name"], "distanceAngstrom": round(distance, 3)}
    pi = int(np.argmin(distances))
    result = {
        "schemaVersion": 1, "pdbId": "5VAI", "title": "Cryo-EM structure of the activated GLP-1 receptor in complex with a G protein",
        "method": "single-particle cryo-electron microscopy", "resolutionAngstrom": 4.1,
        "units": "angstrom", "coordinateFrame": "Unmodified deposited PDB Cartesian coordinates; all chains share the same frame",
        "isMolecularDynamics": False, "isExperimentalCoordinateModel": True,
        "source": {"pdb": urls["5VAI.pdb"], "mmcif": urls["5VAI.cif"], "rcsb": "https://www.rcsb.org/structure/5VAI",
                   "structureDoi": "https://doi.org/10.2210/pdb5VAI/pdb", "paperDoi": "https://doi.org/10.1038/nature22394",
                   "citation": "Zhang et al., Nature 546, 248–253 (2017)",
                   "license": "CC0 for PDB archive data", "licenseUrl": "https://www.wwpdb.org/about/usage-policies",
                   "sha256": hashlib.sha256((directory / "5VAI.pdb").read_bytes()).hexdigest()},
        "chains": chains, "helices": helices, "sheets": sheets, "disulfides": disulfides,
        "displayTransform": {"originAngstrom": center.tolist(), "rotationRowMajor": rotation.tolist(),
                             "formula": "display = rotationRowMajor * (originalPosition - originAngstrom)",
                             "unitsAfterTransform": "angstrom", "yAxis": "approximately extracellular (+) to intracellular (-)",
                             "preservesAllInteratomicDistances": True, "scaleForThreeJs": .05,
                             **summary(display_positions.tolist())},
        "transmembraneRanges": [{"name": "TM" + str(i + 1), "chain": "R", "start": s, "end": e,
                                  "purpose": "approximate visual orientation, not a new topology annotation"} for i, (s, e) in enumerate(tm_ranges)],
        "membraneGuide": {"frame": "displayTransform coordinates", "planeY": 0, "suggestedThicknessAngstrom": 30,
                          "isSchematic": True, "note": "Illustrative lipid layer only; membrane plane is not measured from this structure."},
        "bindingPose": {"boundInDepositedModel": True, "ligandChain": "P", "receptorChain": "R",
                        "minimumHeavyAtomDistanceAngstrom": round(float(min(distances)), 3),
                        "closestLigand": {k: ligand_atoms[pi][k] for k in ("resid", "resname", "name")},
                        "closestReceptor": {k: receptor_atoms[int(nearest[pi])][k] for k in ("resid", "resname", "name")},
                        "residuePairsWithin4_5Angstrom": sorted(residue_contacts.values(), key=lambda v: (v["ligandResid"], v["receptorResid"])),
                        "note": "Native deposited bound coordinates retained. Distance contacts are geometric proximity, not automatically hydrogen bonds."},
        "renderNotes": [
            "Apply one identical rigid transform and scale to every chain; never center individual chains.",
            "Use segments to avoid bridging missing residues. ca[].backbone contains deposited N/CA/C/O for ribbon orientation.",
            "Use secondary (helix/sheet/coil), helices and sheets for representation; smoothing between CA points is a display interpolation only.",
            "atoms retain deposited heavy atom coordinates; inferredCovalentBonds are geometric rendering aids, not an experimental bond-order table.",
            "R is rabbit GLP-1R; the complex includes mixed-species Gs components. P is human GLP-1(7–37), not semaglutide.",
            "Nanobody N is an experimental stabilizer; it can be hidden for physiology illustrations.",
            "The deposited structure is a single active, ligand-bound conformation, not a dynamic trajectory or a simulated binding process.",
            "Any ligand approach, signaling pulse, membrane layer, cAMP burst or conformational interpolation must be labeled as explanatory animation."]}
    write_json(ROOT / "public/molecules/glp1r.json", result, compact=True)
    write_json(directory / "extraction-summary.json", {
        "pdbId": "5VAI", "sourceFiles": [{"path": name, "url": url, "sha256": hashlib.sha256((directory / name).read_bytes()).hexdigest()} for name, url in urls.items()],
        "chains": [{k: c[k] for k in ("id", "role", "name", "organism", "modeledResidues", "modeledResidueRange", "segments")} for c in chains],
        "bindingPose": {k: v for k, v in result["bindingPose"].items() if k != "residuePairsWithin4_5Angstrom"},
        "contactResiduePairsWithin4_5Angstrom": len(residue_contacts), "displayTransform": result["displayTransform"]})
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--molecules-only", action="store_true")
    args = parser.parse_args()
    if not args.molecules_only:
        manifest = anatomy(args.source)
        print("Anatomy:", ", ".join(manifest["assets"]))
    molecule = molecules()
    print("5VAI:", ", ".join(f"{c['id']}={c['modeledResidues']} CA" for c in molecule["chains"]))
    print("Receptor-ligand minimum heavy atom distance:", molecule["bindingPose"]["minimumHeavyAtomDistanceAngstrom"], "angstrom")


if __name__ == "__main__":
    main()
