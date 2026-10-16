# V06 imagery and reusable asset interfaces

## Blender sphere

- `blender/spherical_raindrop_v06.glb`: exactly one smooth sphere mesh, node `spherical_raindrop`, origin at its center. Vertex bounds are approximately `[-1,1]` on all axes; the node has a gentle 0.99 Y scale after Blender→glTF axis conversion. If exact spherical geometry is desired for the ray-tracing illustration, use the mesh geometry without the optional node scale.
- The material uses water IOR **1.333**, transmission and clearcoat glTF extensions. Three.js may replace the material to match the film's common lighting and transparency treatment.
- `blender/spherical_raindrop_v06.blend`: packed photographic-style studio environment, smooth mesh, two soft light strips, and a deterministic 20 second / 600 pose continuous camera source. It can be rendered with `D:/blender/blender.exe`; no MCP server is required.
- `blender/raindrop_hero_v06.png`: 1080×1080, true rendered RGBA. All four corners have alpha0; there is no post-hoc square-image background cutout. This is a photographic studio beauty illustration, not numerical ray-tracing evidence.
- `blender/micro_orbit_clean/drop_0001.png`…`drop_0120.png`: completed four second 30fps / 640×640 camera insert, source camera poses241–360. Each is rendered from Blender's 3D camera; no static-photo pan or optical-flow interpolation. All120 frames have unique hashes and transparent corners. The motion is deliberately quiet; use the GLB camera world for large-scale moves. Preview: `micro_orbit_preview.mp4`; inspect `quality-audit.json` for review limits.

Blender source builder: `work/build_blender_raindrop_v06.py`. `BLENDER_CYCLES_DEVICE=CPU` retains CUDA capacity for voice synthesis. The default uses OPTIX when it is available. The short insert is optional; the GLB supports the full Three.js camera journey directly.

## Qwen moving backgrounds

The official generation batch is `work/generate_qwen_batch_v06.py`, model `wan2.6-t2v`, six5s/1080p silent assets. Credentials must be injected into only the process environment. They are never written into this project or passed as command arguments.

For each slug under `qwen/generated/<slug>/`:

- `provider.mp4`: original downloaded moving provider output.
- `cfr_allintra.mp4`: deterministic30fps/1920×1080/all-intra/without audio backup.
- `frames/frame_0001.jpg`…`frame_0150.jpg`: **actual video frames**, stable for Remotion random seeking; no still-photo pan.
- `provenance.json`: official taskID, model, prompt, seed, requestID, file hash and purpose. Signed provider download URLs are deliberately not persisted.
- `contact.jpg`, `quality-audit.json`: frame selection and pixel-motion screening. Contact-frame viewing is distinct from full subjective playback.

Recommended narrative use:

| slug | Role | Suggested handoff |
|---|---|---|
| street | Rain-after-shower hook | Right-biased crop excludes the incorrectly visible forward sun; slow forward fly into the local observer/rain world |
| garden | Excluded fromV06 | Provider original and ledger retained; forward sun placement conflicts with the observer geometry lesson |
| waterfall | Mist passage | Move through a sunlit spray foreground into the modeled droplet |
| droplet | Real macro to Blender/Three.js | Match the spherical center and curved reflection, then replace with projected GLB |
| circle | High viewpoint atmosphere | Geometry determines the real42° cone/circle; generated circle is only an atmosphere illustration |
| fountain | Return-to-life experiment | Follow modeled spray into the real stone fountain, then close on rainbow in mist |

Qwen footage supplies photographic feeling, never angle measurements or experimental evidence. The deterministic Three.js ray-tracing world provides numerical angles and physical explanations. Only assets that pass framing/motion review should be used; generating all six is not a requirement to show a poor scene.

If frame caches are cleaned after final delivery, regenerate from retained originals without credentials:

`python work/generate_qwen_batch_v06.py --prepare-only`

The older bridge in `qwen/rain_garden_bridge_cfr_allintra.mp4` is a fallback from task3c618e99…; it contains an artificial blue wedge and is not recommended as a full-screen hero. Its ledger is kept as historical provenance, not evidence of a new V06 generation.

## Covers and inventory

Four independently composed sRGB JPGs are in `delivery/covers_v06/`, with lossless no-text plates, layout coordinates, true source hashes, full-size and160/320px review records. Covers use the actual spherical Blender mesh rendered with transparent-glass film settings, then two-surfaceSnell refraction maps the same procedural sky/rainbow background into the droplet. This is an artistic cover camera and backdrop, not an experimental photograph.

`delivery/素材清单V06.json` records the six real Qwen taskIDs, five accepted distinct clips/six narrative windows, original Lux3D ZIP/PLY/GLB,22000 sampled anisotropic Gaussian elements, Blender sources and cover rights/hash metadata. No standaloneGQB exists in this project; any future originalGQB must be retained. `delivery/清理候选计划V06.json` is a proposal only, with no deletion performed; preserve raw sources, current waveforms and all contact sheets.
