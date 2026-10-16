# V16 garden, water and Gaussian handoff

Frozen asset inputs remain unchanged. This round writes only `public/assets_v16`.

## Integrated components

- `CinematicEnvironmentV16` replaces the V09 environment. It preserves exact imported tree geometry, alpha-masked leaves, material maps and shared instancing. `setSurfaceVisibility(1)` selects the full mesh branch. `setGaussianSupportVisibility()` selects continuous ground, photographed rocks/path, complete tree crowns and fern/shrub support for visible 3-D covariance splats.
- `GaussianSceneV16` loads 419,604 authored artistic covariance splats. This is a mesh-supported artistic conversion, **not trained photographic 3DGS**. Covariance is projected through the actual perspective camera and displaced centres are sorted by actual camera depth. Scatter is limited to 0.45 m and applied only to a peripheral band, with category weights keeping ground and pool coherent. Film settings `.78` opacity, `.86` pointScale and `.035` scatter remain visibly nonzero.
- `WaterPoolV16` keeps the old constructor and re-exports `loadWaterProV09`. `update(frame, 'mesh' | 'gaussian')` makes reflection-cache keys distinguish the branches. `setSolarDirection(direction)` accepts a normalized ground-to-sun direction. The water uses the existing licensed Water Pro WebGL adaptation; no FFT, SSR, CFD or WebGPU is claimed.
- `SunlightV16(scene)` has `setSolarDirection(direction)`, `update(frame,camera,strength)` and `dispose()`. Its camera-relative 0.53-degree core and restrained glare lie on the same actual solar direction as shadows. Ground-level sun doodles are disabled by the film owner.

## Pool geometry and final look

The ceramic cylinder and regular torus were removed. The natural pool uses an irregular 1.57 m by 1.34 m boundary, a continuous depressed pebble bed, a graded soil/grass shore, 48 shared CC0 shore rocks and 160 submerged pebbles. Runtime clipping uses the same radial function and centre `[-3,.025,3]` as the Blender asset.

The final water shader has actual scene reflection/refraction buffers and a clear blue-green calibration. A `.36` minimum reflected contribution is a visual art adjustment, not a measured Fresnel result. Submerged bed brightness is `.32`, mild wave amplitudes are 6/3/1.1 mm, wind strength is 1.8, and perfect white concentric rings were removed. Fine grass brightness is `.62` in both mesh and splat branches. Optical ray geometry, spectrum and measured rainbow angles are untouched.

## References actually inspected

- [Three.js Water source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/objects/Water.js): downloaded and read. Adopted real reflected scene buffers, restrained distortion and matching solar direction; existing licensed adapter remains the renderer.
- [Three.js ocean example](https://raw.githubusercontent.com/mrdoob/three.js/master/examples/webgl_shaders_ocean.html): downloaded and read; retained broad low-amplitude waves rather than perfect decorative rings.
- [INRIA 3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) and the published `ours_garden.png`: downloaded; the garden image was visually inspected. Adopted continuous dense ground and readable crown volumes. It is an aesthetic reference, not a claim that this scene was trained with their method.
- The authoritative CC0 asset/license record is `public/assets_v15/environment/source-licenses-v15.json`. Original tree/rock geometry and all source maps are retained.

## Actual review scope

Blender Cycles previews at 1280×720, 28 samples: `natural_pool_close.png`, `natural_pool_garden.png` were opened and inspected. They verify source geometry only; Blender preview water is static and is excluded from the exported GLB.

Actual WebGL previews at 1280×720: pool F120; mesh F0/F120; Gaussian F0/F120 were rendered and viewed. Pool was revised twice after the early result read as dry paving. Final `webgl-pool-120.png` shows pale blue transparent water, bed stones and a reflected tree crown. Gaussian support was expanded after the early foliage result became blurred patches.

Whole-film clean stills F610 and F10150 were opened and inspected. The tree crowns/ground are complete, white dish is gone and no ground-level yellow sun icon is visible. Those stills predate the final water/grass calibration, so the film owner is rerendering final endpoints and full-film QA.

`npm run check` passes. GLB and BLEND hashes match the environment provenance. Gaussian metadata source GLB hash matches the exported GLB; normalized quaternion residual is 1.79e-7. `work/audit-gaussian-scene-v16.mjs` checks finite covariance, complete stable depth permutations, and reverse/random seek reproducibility.

This component review does not certify full-film audio, text layout or all transition frames; those remain the film owner's integrated QA scope.
