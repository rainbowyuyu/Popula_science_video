# v16 world handoff

Production entry is `src/beso/LaunchWorldV16.ts`, an async wrapper for the isolated native WaterPro WebGPU bundle. Await `ready`, then each `render(t)` or `renderBlueprint(t)`; `info` supplies the existing anchors and saved values.

## Native WaterPro

The licensed extracted Three.js Water Pro 3.1.1 is compiled with isolated Three.js 0.183.0. `WaterSystem.create` uses the native WebGPU backend, and the production runtime throws if another backend is selected. Existing project Three.js remains unchanged. The renderer needs `scripts/renderer-options-v16.mjs` and its compatible headless Chrome DXIL pair. `node research/v16-world-build.mjs` rebuilds `public/assets/v16/world-webgpu.js`.

The fixed seed is **0.164219**. Large integer seeds must not be used with this package spectrum implementation: it multiplies the seed by 100000 before float32 hashing, so a seed of 164219 collapses adjacent indices and produces repetitive concentric wave rings. This was diagnosed and removed without replacing WaterPro. The saved Z-wind response is still independent of this visual ocean.

The natural water, sky, native hull and camera between 7 and 21 seconds are frozen for WAN first/last-frame bridges. `rain`, `spray`, persistent wave foam, particles and film grain are disabled for frame seeking. All preset-disabled scene children preserve their initial visibility during blueprint restoration. The original native mooring endpoints and paths remain bound to the saved response.

## Model and camera

Blender 5.1.2 built a boolean-unioned fabrication shell with compact central receiver, bevels, weighted normals, and fairlead support cradles. It preserves the nine native member axes and twelve original cable paths. `native-fabrication-source.blend`, GLBs, script, and contact report are retained. This display shell is not new solver CAD.

The C1 camera route begins with a full turbine, cranes down to the platform, inspects the separate saved BESO specimen, dives under the west side with the selected cable on the right, completes a restrained orbit for the workflow and review, and ends on a full turbine. BESO positions and faces are untouched; display normals and a unified engineering coating prevent the old shader-dependent color artifacts on WebGPU.

## Validation

- TypeScript check passed.
- 19 representative world frames render without page or console errors.
- All 6301 camera samples are finite; key velocities are continuous, minimum camera-target distance is 154.98 m and minimum clearance to static native member envelopes is 105.40 m.
- Same-time and out-of-order images at 7, 17, 46 and 99 seconds differ at most **one 8-bit channel level**, with mean differences below 0.00006. PNG hashes are not byte-identical because of GPU rounding; no visible wave/geometry drift is present. Full raw metrics are retained.
- `research/v16-world-preview/contact.jpg` has the representative shots.
- `research/v16-world-preview/report.json` records actual backend, all preset values, PNG hashes, and pixel comparison.
- `research/v16-world-camera-qa.json` records trajectory checks.
- `research/v16-world-provenance.json` records file hashes and scope.

Final typography, composed-video occlusion, audio and decoded-film QA belong to the main composition pipeline.
