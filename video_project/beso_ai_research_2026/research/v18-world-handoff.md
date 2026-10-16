# V18 world — three columns and complete anchor chains

Use `LaunchWorldV18` from `src/beso/LaunchWorldV18.ts`, await `ready`, then `await render(seconds)`. The public `info`, render and disposal interface remains compatible with V17. The runtime is `public/assets/v18/world-webgpu.js`; use the existing project WebGPU Chrome and WaterPro environment. No V17 assets or sources were edited.

## Geometry

- The Blender source and exported GLB contain exactly **three outer columns and three horizontal circular bottom bases**. `CentralKeel` and `CentralFoot` have been removed. `CentralHub` remains at 20.3–28 m, supported by three continuous radial box braces; the wind-turbine tower starts at its top.
- Columns retain 6° outward inclination. Exported GLB rotation verification confirms base axes remain vertical and base planes horizontal.
- Twelve outboard padeyes remain on the three low base rims, four per base. **All twelve lines are alternating closed steel links from the padeye to the anchor**, above and below the optical water surface. There is no chain-to-smooth-cable transition.
- 5,634 links use 24 `InstancedMesh` batches. The first 90 m of each line have finer ring tessellation; the remainder retains real closed links with fewer ring segments. This split is static, so camera motion does not trigger a visibility or LOD pop. Link centres follow equal arc lengths, and adjacent ring planes alternate 90°.
- When the studio model separates, hatches and column-root seams follow their column, brace seams follow the brace, and base fittings follow the base. Tower bolts stay with the hub. This also fixes the older detached gold seam strips.

The source solver model and archived Zwind response hashes are unchanged. This corrected presentation geometry and its curved anchor-chain path are visualizations, **not a new solved model**. Saved scalar data are read independently; no archived displacement is applied to the revised geometry.

## Camera / overlay contract

The eight scene intervals and physical sheet occlusions remain at 25.5, 40.5, 55.5 and 97 seconds. The camera is C1 continuous across 6,301 sampled positions. The 12–24 s route is more lateral to keep the rear third column visibly separate from the central hub; the old axis-aligned projection made the rear base look like a fourth central support.

| Interval | Overlay space / model movement |
| --- | --- |
| 0–12 s | Sea macro to complete turbine; left text lane |
| 12–24 s | Three-column side orbit; left text lane |
| 27–39 s | Saved BESO object on studio table; right text lane |
| 42–54 s | Full-link mooring closeup; left text lane |
| 57–65 s | Studio model held to the right; x=100–760 left lane clear |
| 65–72 s | Smooth lateral handoff toward left; exit feedback details before 67 s |
| 72–88 s | Review model at left, deliberate component separation / return; right UI x≈1120–1820 |
| 88–96 s | Review model and right evidence lane |
| 98–105 s | Complete turbine aerial close, left text lane |

The maximum review view intentionally crops the far left edge of the left column. New product UI should stay in the reserved right lane rather than overlap the near right column. The parent composition still needs final text/caption overlap checks.

## Validation and evidence

- `research/v18-world-model-qa.json`: exported count and axes, no central support, all 12 full chains, four lines per base, fairlead/anchor endpoint errors below 1e-6 m, preserved source hashes, no preview-browser errors.
- `research/v18-world-camera-qa.json`: 6,301 finite samples; all C1 knot checks pass; minimum camera-target distance 36.07 m; minimum camera height 14 m.
- `research/v18-world-preview/contact.jpg`: 20 selected no-overlay scene samples. `transitions.jpg`: 12 pre/mid/post sheet-transition samples. Full-size JPGs retain original 1920×1080 resolution.
- `research/v18-world-determinism/pixel-qa.json`: repeated nonsequential seeks at 48, 80 and 0 s, maximum channel difference 1/255 at sea and zero in studio.
- `research/v18-world-provenance.json`: final source/asset hashes, package and evidence boundaries.
- `npm run typecheck` passed after the world changes.

These are world-only checks. They do not assert final narrated-film decoding, typography QA, audio QA, full normal-speed watch or human listening. The main render pipeline owns those checks.

Build entry points: `scripts/blender_v18_native.py` with `D:/blender/blender.exe`, then `node research/v18-world-build.mjs`. The `.blend`, GLBs and authoring source are retained under `public/assets/v18` and `scripts`.


## Final camera correction

After the parent composition review, 9.5 s and the 98/102/105 s camera keys were rotated 18 degrees laterally without changing the radius, elevation, target point or 12–24 s route. This exposes the rear third column beside the hub in the final aerial view; it no longer projects as a central fourth base. The final five world-only samples are `final-side-camera-contact.jpg`. The 9.5 s crane shot intentionally includes slight lower-base cropping; the 102/105 s complete turbine is in frame. Right-upper branding and the left title lane remain clear. Final random-order checks are in `v18-world-determinism/pixel-qa-final-camera.json`. Model/response hashes and chain counts remain verified.
