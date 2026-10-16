# V17 world handoff

Frozen 2026-10-14. Parent composition is `LaunchV17`; no V16 sources were changed by this world rebuild.

## Runtime

Use `LaunchWorldV17` from `src/beso/LaunchWorldV17.ts`, await `ready`, then `await render(seconds)`. The wrapper loads `public/assets/v17/world-webgpu.js`. It requires WebGPU and intentionally fails if WaterPro falls back to WebGL. The production Chrome path is `work/browser-webgpu/chrome-headless-shell.exe`.

Blender was actually executed with `D:/blender/blender.exe` (5.1.2). Model, source blend, revised visual layout, upper turbine and authoring script are retained. WaterPro 3.1.1 is the licensed native package, isolated with Three 0.183.0. Its FFT/Gerstner ocean uses deterministic seed 0.1741 and 1/60 s ticks. Near water clipping is 0.4 m; the 20 m library default caused a visible cut across the bottom of close shots and was fixed.

## Visual model / evidence boundary

Three short horizontal circular ballast bases, columns tilted outward by 6 degrees, continuous diagonal radial box braces, central receiver, tower, nacelle, blades, and twelve moorings attached to outboard base eyes. Each base has four chain attachments; the near lengths contain actual interlinked chain geometry. Dark teal ballast bases and restrained champagne rims contrast with pearl columns. Studio braces use graphite teal.

`visual-layout.json` describes a revised presentation geometry, **not** the archived solver model. `native-model.json` is unchanged (SHA verified). Saved Zwind response scalars are sampled independently and never imposed as exact displacement of this changed mesh. The BESO surfaces use their original saved indexed coordinates. No new coupled solver run is claimed. Revised line curves and optical waves are visual demonstrations.

## Timeline / parent layout contract

| Seconds | Scene / movement | Title safe lane |
| --- | --- | --- |
| 0–6 | Chain eye macro, outward crane to complete platform | Left; keep the initial chain macro lightly labelled |
| 6–12 | Rise to tower and complete turbine | Left |
| 12–24 | Close platform orbit at sea | Left |
| 24–27 | Physical near-camera drafting sheet crosses lens into studio | Clear text by 25.2 |
| 27–39 | Close orbit of saved BESO states on technical table | Right |
| 39–42 | Sheet passes in reverse, route returns to sea | Clear text by 40.25 |
| 42–54 | Descend to outboard eyes and four lines, saved scalar evidence | Left |
| 54–57 | Sheet crosses into review studio | Clear text by 55.05 |
| 57–72 | Platform on studio table; slow close orbit | Left |
| 72–88 | Model moves to left visual lane; deliberate explode / inspect / reassemble | Right, x >= 1220 |
| 88–96 | Assembled review platform; crane out for delivery evidence | Right, x >= 1230 |
| 96–98 | Physical sheet cross to sea | Clear text by 96.9 |
| 98–105 | Complete turbine maintained; slow aerial retreat | Left |

The exact opaque wipe centres are 25.5, 40.5, 55.5 and 97 seconds. Studio visibility changes only at these full-occlusion times. The BESO object is visible only between 25.5 and 40.5 seconds, so it cannot leak into the ocean background. No fades are used for those switches.

Studio component separation: 73–76 s increasing separation, 76–81 s inspection hold, 81–85 s reassembly. Outer columns lift and move radially; bases stay horizontal. Parent may label this interval as assembly review so the deliberate separation is understood.

`info` retains `native`, `lineTension`, `fairlead`, `platform`, `towerTop`, `beso`, and `anchors`; adds `phase`, `studioMix` (0 sea / 1 technical-table theme), and `titlePlacement`. Studio review object occupies approximately x=0–1150 by 76 s. `native` values are archived scalar evidence and do not imply the revised layout was solved.

## Validation

- `npm run typecheck` passed.
- `research/v17-world-camera-qa.json`: 6301 sampled camera positions, all finite; C1 knot checks passed; minimum camera-target distance 36.07 m; minimum camera height 14 m. High-speed cross-scene travel is hidden by physical foreground occlusion.
- `research/v17-world-model-qa.json`: source hash unchanged; 3 bases; 12 lines; exactly 4 per base; base planes horizontal.
- `research/v17-world-preview/contact.jpg`: representative overview. `transitions.jpg`: four pre/mid/post transition inspections. Final `time-006.jpg` includes the last distant-BESO visibility repair.
- `research/v17-world-determinism/pixel-qa.json`: random-order repeated 0/48/80 s; maximum channel difference 1/255 at 0 and 48 s, 0 at studio 80 s. This is GPU numerical tolerance, not byte-identical output.
- Standalone browser previews reported no page or console errors.
- Source and runtime asset hashes are retained in `research/v17-world-provenance.json`.

Final composition text/logo/subtitle and full-movie audio/decode QA belong to the parent render pipeline and are not asserted by these world-only checks.

## Final visual revision

The four wipe sheets now carry a high-contrast, double-sided engineering plan (three circular bases, radial box braces, twelve mooring directions, centre axes; no generated text). Sheet width reduced from 32 m to 20 m and timing shortened. At 25.75 s the sheet has cleared; full opaque centre remains 25.5 s. Enlarged studio table and neutral surround remove the ocean sliver at the upper edge. Six subtle dashed assembly guides now connect separated columns to base positions during 73–85 s. Camera keys remain unchanged. Checked world frames 25.25 / 25.5 / 25.75 / 26.5 / 40.5 / 55.5 / 80 / 97 seconds.
