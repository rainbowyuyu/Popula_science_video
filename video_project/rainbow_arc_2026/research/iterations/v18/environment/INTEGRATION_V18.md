# V18 Blender environment integration

- Source: `public/assets_v16/environment/rain_garden_v16.blend` (read-only)
- Runtime asset: `public/assets_v18/environment/rain_garden_v18.glb`
- Blender source: `public/assets_v18/environment/rain_garden_v18.blend`
- Provenance: `public/assets_v18/environment/provenance-v18.json`
- Review frames: `research/iterations/v18/environment/natural_pool_close.png`, `natural_pool_garden.png`

## Visual changes

V18 preserves the irregular pond boundary and source CC0 geometry, removes inherited V16 pond objects including pivot empties before rebuilding, and tunes the linear PBR palette toward the hand-painted mint/olive opening frame. Wet stones and water retain physically based roughness/IOR. The .blend contains warm-key, cool-fill and wet-rim area lights with deterministic keyframes (frames 1/45/90/135).

## Runtime changes

`src/V11RainbowArcFilm.tsx` now loads `assets_v18/environment/rain_garden_v18.glb`; Gaussian, fish and optics remain V16. `src/CinematicEnvironmentV16.ts` adds deterministic foliage wind (`uV18WindTime`, seed-compatible sine displacement, strength 0.028) to leaf/fern/shrub/meadow materials and a low-energy wet-rim light with bounded frame-driven pulses. No optical path, refractive index, or angle code was changed.

`src/WorldV10.ts` uses `ringScale=1.12` only for the rendered atmospheric shell around the exact observer centre; traced angles and rays remain unchanged.

## Checks

- `D:\blender\blender.exe --background --python scripts/build-environment-v18.py` — passed.
- Same command with `-- --render` — passed; both review PNGs written.
- Blender inspect: 2,595 objects / 2,379 meshes; no `v16_*` derived pond objects remain; V18 light key ranges 1–135; custom wind metadata present.
- `npm run check` (`tsc --noEmit`) — passed.
- GLB SHA-256: `1bd8142c9ce91f41d72eb4f333e1e7deef6dc5f3bfafb51b65a1524f68c76fb3`.
- Blend SHA-256: recorded in `provenance-v18.json`.
