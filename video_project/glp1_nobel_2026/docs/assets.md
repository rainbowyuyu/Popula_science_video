# Reference assets and coordinate guide

## Anatomy

`public/models/manifest.json` is the machine-readable index. Each entry in `assets` provides a web-relative path, actual exported bounds, center, mesh/triangle counts, source part names, source commit, license and SHA-256. All GLBs were successfully parsed by the installed Three.js `GLTFLoader`; results are saved in `research/qa/asset-validation.json`.

The geometry is BodyParts3D 4.0 from the existing Human Atlas checkout, commit `1c38bf35c254a891200d3cedecfd57abebe83d8d`. Source packed float32 vertex positions and triangle indices are preserved. Quantized normals are decoded. Materials are restyled. No organs are generated, remeshed, deformed, independently recentered or independently scaled.

- Unit: metre. Y points upward, +X toward the subject's left, +Z toward the subject's front.
- Body height: approximately 1.719 m, with soles at Y≈0.
- Load all organs as siblings with identity transforms under one common body parent. A positive-Z camera sees the subject from the front.
- `body.glb` and `skin.glb` are byte-identical aliases. Display one.
- The brain excludes ventricular cavity meshes. Heart parts are individually named, so cavity meshes can be hidden for exterior shots.
- The pancreas uses outer surface FJ1895. The near-coincident parenchyma FJ2629 is deliberately excluded. `pancreatic_ducts.glb` is optional.
- Small intestine includes duodenum, jejunum, ileum and ileocecal junction: 56 atlas parts. It is not an invented generic coil.
- Liver includes the eight parenchymal atlas segments. Aorta uses ascending, arch and complete descending surfaces, omitting overlapping subdivisions.
- Veins are selected real portal, mesenteric, splenic, hepatic and caval segments. They are not a complete perfusion network. No blood-flow direction or velocity is encoded.

Approximate organ centers in shared metres (exact bounds are in the manifest):

| Asset | X | Y | Z | Triangles |
|---|---:|---:|---:|---:|
| Body/skin | −0.0006 | 0.8597 | 0.0008 | 44,744 |
| Stomach | 0.0384 | 1.1765 | 0.0379 | 1,686 |
| Small intestine | 0.0098 | 1.0193 | 0.0437 | 15,792 |
| Pancreas | 0.0124 | 1.1193 | 0.0209 | 2,534 |
| Liver | −0.0103 | 1.1837 | 0.0228 | 26,300 |
| Brain | −0.0005 | 1.6256 | −0.0203 | 129,912 |
| Heart | 0.0214 | 1.3050 | 0.0234 | 42,540 |
| Aorta | 0.0140 | 1.2100 | −0.0087 | 1,986 |

Suggested body camera: position `[0,.88,3.1]`, target `[0,.88,0]`, 34° vertical FOV. Digestive close-up: position `[.03,1.1,.88]`, target `[.01,1.095,.025]`, 30° FOV. Pancreas lies behind the stomach; reveal it with clipping or controlled tissue opacity rather than moving it to a false anatomical position. Skin is a soft contextual shell, not an opaque obstruction.

Data: **BodyParts3D, © The Database Center for Life Science, CC BY 4.0**. Human Atlas application code: MIT. Full attribution and original MIT text are copied into `public/models/ATTRIBUTION.md` and `HUMAN_ATLAS_MIT_LICENSE.txt`. The current official database license supersedes older CC BY-SA text found in historical OBJ comments. Sources: [BodyParts3D license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html), [dataset](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), [Mitsuhashi et al.](https://doi.org/10.1093/nar/gkn613), [Human Atlas](https://github.com/ashemag/human-atlas).

## Experimental GLP-1R complex

Original deposited `5VAI.pdb`, `5VAI.cif` and RCSB entry metadata are saved under `research/structures/`, with source hashes in `extraction-summary.json`. The render data is `public/molecules/glp1r.json`.

5VAI is a **single active, ligand-bound cryo-EM coordinate model at 4.1 Å resolution**. The biological assembly transform is identity; all deposited chains already share the correct bound pose. It is not an MD trajectory, a docking calculation, semaglutide, or an all-human complex.

| PDB author chain | Role | Species | Modeled CA residues |
|---|---|---|---:|
| R | GLP-1R | Rabbit | 387 |
| P | GLP-1(7–37) | Human | 31 |
| A | Gs alpha | Human | 234 |
| B | G beta 1 | Rat | 340 |
| G | G gamma 2 | Bovine | 58 |
| N | Nanobody 35, experimental stabilizer | Llama | 128 |

Every `chains[]` entry includes original `atoms[]`, ordered `ca[]`, observed secondary structure, source `missingResidues[]`, and explicit CA segment boundaries. CA residues retain deposited N/CA/C/O backbone coordinates for ribbon orientation. `segments` must be respected: notably, receptor R lacks residues 129–134, and Gs alpha contains substantial unresolved intervals. Do not draw a false continuous chain across missing regions.

Positions in the JSON are **original, unmodified ångström coordinates**. The optional `displayTransform` is one shared rigid rotation and translation, with formula `display = rotation * (original − origin)`. It preserves all interatomic distances, places the approximate seven-transmembrane bundle at the origin, and points approximate extracellular direction along +Y. The proposed lipid mid-plane and thickness are visual guides, not experimentally resolved membrane coordinates.

Binding pose check: the deposited receptor/ligand minimum modeled heavy-atom distance is 2.162 Å. The JSON contains residue pairs within 4.5 Å, with the nearest atom pair for each. These values verify contact proximity; they are not automatically hydrogen-bond classifications, affinity predictions or evidence of precision exceeding the map resolution. The ligand N-terminus is already inserted into the receptor transmembrane pocket. Always apply one shared transform; independently centering chains would destroy this verified pose.

Molecular source: [RCSB 5VAI](https://www.rcsb.org/structure/5VAI), [PDB DOI](https://doi.org/10.2210/pdb5VAI/pdb), Zhang et al., *Nature* **546**, 248–253 (2017), [DOI 10.1038/nature22394](https://doi.org/10.1038/nature22394). PDB archive data are available under [CC0 usage terms](https://www.wwpdb.org/about/usage-policies); retain the experimental citation.

## MolecularDetail module

`src/MolecularDetail.ts` exports `new MolecularDetail(base)`, with `root`, `ready`, `render(time,progress)` and `dispose()`. It reads `base + 'molecules/glp1r.json'`. The root's external transform is never changed by `render()`.

The representation uses solid ribbons through real CA points, separate helices and beta strands, and thin observed-backbone connectors. Ribbon interpolation is a representation of one static conformation. Nanobody N is hidden. Phospholipids are instanced symbolic polar heads and paired tails, with an anterior cutaway and a central exclusion for the receptor. They are not part of 5VAI.

The local scale is 0.0165 scene unit per Å. Verified bounds including the membrane at the bound state:

- X: −1.049 to +1.049; Y: −1.432 to +1.189; Z: −0.989 to +0.686.
- Protein-only bound size: 1.335 × 2.620 × 1.196 units.
- Initial ligand approach makes total height 2.851 units.
- Ligand bound center: `[0, .4497, .1354]`. Membrane center: Y=0. Front cutaway: +Z.

Progress 0–.08 holds a displaced ligand; .08–.50 translates/rotates the ligand as a rigid explanatory approach; at .50 it is exactly back in the deposited relative pose. .53–.66 brings in Gs color highlights and schematic signal rings. Gs geometry is not deformed or detached. Camera orbit is preferable to protein wobble. Recommended visible caption: **“GLP-1R–Gs 实验结构 · PDB 5VAI｜结合与信号过程为示意，非分子动力学”**.

## DrugDetail module

`src/DrugDetail.ts` has the same root/ready/render/dispose interface. `getLabels()` returns `{id,text,position:[x,y,z],color,opacity}` in root-local coordinates; `anchors` exposes corresponding `Vector3`s. It creates no text geometry.

The peptide is explicitly schematic: one sphere represents one residue, not an atom, and the helical path is not claimed as an experimentally measured unbound conformation. GLP-1 numbering is 7–37. DPP-4 cleaves after Ala8, releasing the first two residues His7–Ala8. The peptide engineering sequence depicts a new designed molecule; it does not assert that a cleaved molecule is enzymatically repaired.

The semaglutide diagram identifies Aib8 substitution, Lys34→Arg34, and Lys26 acylation with a C18 fatty diacid through a gamma-Glu/two-OEG linker. The lipid has 18 carbon symbols; the linker symbols are explanatory and are not an atom count. Albumin is a transparent abstract three-lobe carrier marked **“白蛋白｜示意”**, not a literal surface. Association is illustrative and reversible; do not label this as a specific experimentally determined binding pose.

Progress: 0–.16 native peptide/short lifetime; .16–.31 N-terminal dipeptide cleavage; .31–.50 molecule engineering; .50–.75 linker, sidechain and carrier; .75–1 sustained carrier association. Source: Lau et al., *J. Med. Chem.* **58**, 7370–7380 (2015), [DOI 10.1021/acs.jmedchem.5b00726](https://doi.org/10.1021/acs.jmedchem.5b00726); bibliographic source was verified against `research/raw/semaglutide_discovery.json`.

## Reproduction and checks

```powershell
python scripts/prepare_assets.py
node scripts/check_assets.mjs
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck src/MolecularDetail.ts src/DrugDetail.ts
```

`prepare_assets.py` copies original anatomy coordinates and retrieves any absent 5VAI files. The molecular extraction needs numpy/scipy. `check_assets.mjs` parses all 11 GLBs with the project's actual GLTFLoader, checks counts and bounds, checks finite molecular mesh vertices, measures stages, and confirms that `render` preserves external transforms. Optional independent visual QA: `node scripts/preview_detail_assets.mjs`, producing screenshots under `research/qa/`. These are model inspection frames, not final film compositing.
