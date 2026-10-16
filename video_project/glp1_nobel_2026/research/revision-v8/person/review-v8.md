# V8 person / hand / measurement revision

## Final implementation

- The original BodyParts3D palm and five fingers remain connected to the wrist. The V7 substitute marching-cubes hand and its shortened silhouette were removed.
- Five local finger chains use separate MCP/PIP/DIP bends. The index supports the fork with a small PIP/DIP bend; the middle finger and thumb provide opposing support; ring and little finger close at different angles. Continuous finger-boundary weights and a light four-pass surface relaxation reduce atlas knuckle creases.
- Resting arms rotate toward palms inward. Chair hands rest dorsal-up on armrests. Measurement uses one supported palm-up hand and one palm-down hand resting on the thigh.
- Measurement blends bone swing and local axial rotation separately, preserves upper/forearm lengths, and interpolates wrist-relative rotation. This removed the mid-transition wrist ribbon/twist seen in the first V8 candidate.
- Measurement forearm skin uses scoped welded smoothing. The cuff now uses the continuous section centre rather than a changing hull-vertex mean, removing corrugation without a large loose cylinder.

## Checks and scope

- TypeScript `npm run check` passes.
- Local harness: `node research/revision-v8/person/preview.mjs --quick --motion` (final meal skin source) and `--measure-motion` (measurement arm/cuff source unchanged since that run).
- Final three close hand views were actually inspected. The updated grasp is materially more coherent than the V7 substitute hand and first V8 equal-finger arches. The underlying atlas remains a visibly simplified mesh.
- Three measurement exit directions were inspected over 41 weights each; no abrupt wrist twist or arm-length collapse seen. The isolated harness keeps furniture in place and uses a fixed camera, so its scene fade/cropped head is not the final film transition or camera.
- Chair support/release and neutral recovery were inspected in front/side contact sheets. No hand jump was identified at the local sample density.
- Final meal cycle: 242 frames generated at 10 fps across two views; 122 frames were actually inspected as eight cropped contact sheets. No gross hand/wrist discontinuity, fork flip, or food scale change was seen in those inspected samples.
- Across the 121 front-view numerical samples: minimum food-to-hand clearance 0.11865 m, tine-to-hand clearance 0.11044 m, fork-to-tabletop clearance 0.10006 m; no degenerate hand triangles; deterministic seek difference 0.
- Limited fork-handle centreline audit found two shallow sub-millimetre inside contacts (0.45 and 0.68 mm) at finger contact; this is not claimed as penetration-free rigid-body collision validation.
- The meal food and fork are rigid and constant scale. Fork/food clearance uses actual hand triangle distances, not a bounding sphere. Centreline contact sampling is a limited geometric audit and is not a full soft-tissue collision simulation.

## Integration still required

The parent owns film cameras, clothing retirement/optical composition, narration, BGM, rendering, and final encoded review. This local report does not certify every rendered movie frame. In particular, the measurement source-pose contract is intended for stand/dining handoff and does not represent an arbitrary mixed chair rig as a clinical skeletal reconstruction.
