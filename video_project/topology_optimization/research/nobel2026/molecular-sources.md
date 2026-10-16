# Nobel 2026 molecular asset research

## Official award verification
- Official Nobel Prize press release (read and parsed): https://www.nobelprize.org/prizes/medicine/2026/press-release/
- Page states **5 October 2026** and jointly awards Karl Deisseroth, Peter Hegemann and Georg Nagel for “their discoveries concerning light-gated ion channels and optogenetics”.
- Official popular information: https://www.nobelprize.org/prizes/medicine/2026/popular-information/
- Official scientific background: https://www.nobelprize.org/uploads/2026/10/advanced-medicineprize2026.pdf

## ChR2 structure selected
- RCSB PDB entry: **6EID**, “Crystal structure of wild-type Channelrhodopsin 2”.
- RCSB metadata API (downloaded): https://data.rcsb.org/rest/v1/core/entry/6EID
- Polymer entity API (downloaded): https://data.rcsb.org/rest/v1/core/polymer_entity/6EID/1
- Coordinate source: https://files.rcsb.org/download/6EID.pdb
- Experimental method: X-ray diffraction; reported resolution 2.39 Å; chain A is the modeled 315-residue channelrhodopsin-2 protomer. The primary citation is Volkov et al., “Structural insights into ion conduction by channelrhodopsin 2”, Science 358 (2017), DOI: 10.1126/science.aan8862.
- Local files: public/nobel2026/molecular/6EID.pdb, 6EID.entry.json, 6EID.entity-1.json.
- SHA-256: PDB 1B85E46CD85064F8C4CB1394FF8423964C87C86504F61A8208FFCF90DD3B3F63; entry metadata 46FAC851BCB6BDDF7481A83BA66E80F1D5D48A528890082F0708DB5C7B0C6D58.

## Actual molecular drawing tool evidence
- Tool: **3Dmol.js 2.5.5**, installed with `npm install 3dmol --no-save` and executed in a real headless Chromium/WebGL page.
- Reproducible script: scripts/render_chromophore_3dmol.mjs.
- Command: `node scripts/render_chromophore_3dmol.mjs`.
- Output: `public/nobel2026/molecular/renders/6EID-chainA-cartoon.png` (SHA-256 F790259BE8AC0B6C151BD31FFAFC98DF8898CC111194A40C23F4E6BAC1C35426).
- Rendering choices: chain A cartoon colored by residue order; LYR retinal-linked lysine residue rendered as sticks; phosphate ions lightly shown as spheres; other chain/solvent omitted to keep the biological object legible on white.
- Tool output uses the actual PDB coordinates; it is not a hand-drawn icon or generated approximation. Script SHA-256: 651FF32D99C45AFE9E62A80B2700FEBBF488655DF8386EA3AE1C1F5A4F824736.

## Reusable animation data
- 6EID-chainA-ca.json: 246 C-alpha points from chain A, schema pdb-ca-v1, coordinates in Å, for a backbone trace/three.js ribbon or particle path.
- 6EID-retinal-LYR.json: 58 atoms in residue LYR on chain A, schema pdb-ligand-v1; this is the retinal-linked lysine residue modeled by PDB 6EID and is explicitly marked as a ligand anchor, **not a complete free retinal molecule**.

## Scientific boundary for the video
- The 6EID image is the experimentally determined static molecular structure of ChR2; it should be labeled “结构证据 / PDB 6EID”.
- The blue-light opening, ion flow and action-potential animation in the film is a teaching schematic. It must not be presented as a time-resolved opening trajectory derived from this static X-ray structure. Use a separate label such as “机制示意（基于 Nobel 官方叙述）”.
