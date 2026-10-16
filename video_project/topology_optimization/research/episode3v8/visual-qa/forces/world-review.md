# v8 World implementation review

Scope: the pure Three.js world and selected shot states. Film typography, the final narration timeline, soundtrack and the rendered full video require the main integration review.

## Implemented

- One persistent pavilion: 117 named parts/meshes. All source geometry and physics assets are still read from `public/episode3v7`; no v7 source or asset was changed.
- `getPartAssemblyQ()` reverses only `HIP_FL` in hip sentence 1: installed `.893`, lifted `.875`, moved outward `.855`, aligned above `.875`, seated `.893`. Its other three hips and hub remain installed. The move follows the original approved assembly keys. The chapter entrance still uses the common four-second assembly blend.
- The hip camera tracks from the front with enough side angle to read the outward translation and both real supports.
- Gravity follows actual named surfaces through roof/board/rafter/birdsmouth/purlin/corner half-lap/cap/arms/block/column/stone. Explanatory paths are not claimed to be a contact-force solution.
- Gravity sentence 4 uses a 2.4 m camera distance. Surrounding structure becomes translucent, and moving explanation dots pause so the selected signed beam field can be read.
- `SurfaceSampling.ts` refines only the display triangles of `PURLIN_Y_LEFT` to a maximum 0.07 m edge. The original triangle planes, boundary, notches and UVs remain unchanged. This fixes interpolation across several native beam elements on a single long exported triangle. It is not an additional finite-element solve.
- The displayed signed probes now use the exact same side-surface positions as the labels: top `[-1.59,4.1395,0.396]` = **−0.0978232322 MPa**; bottom `[-1.59,4.0005,0.396]` = **+0.1124673547 MPa**. Both use native element 177 at the selected station. The stress range remains the true whole-purlin range; faint colors at this section are expected.
- Wind sentence 6 shows an original-position ring, current-position point and connecting displacement line, all attached to the same real column surface. The displacement display uses the existing 250× gain; it is not an independently solved surface node.
- Force-arrow tips follow deformed surface triangles; cylindrical shafts improve readability. Roof wind directions come from the recorded engineering `force_N` panel boundary conditions.
- Every annotation keeps one fixed physical surface point throughout its cue. No candidate swapping occurs per frame. The bent and bracket anchors additionally expose projected group bounds and member IDs.
- The mortise marker is on the real lower opening lip. During the shoulder explanation the adjacent post becomes translucent, exposing the real shoulder. The displacement point avoids the longitudinal mortise opening.
- The camera reaches the stone at gravity `u=6.82`, before its first spoken name, and holds near the footing through `u=7.72`.

## Evidence

- `npx tsc --noEmit --pretty false`: passed.
- `node research/episode3v8/visual-qa/audit-force-world.mjs`: 23 selected hip/gravity/wind states, forward then reverse random access; 117 meshes in every state.
- All 23 camera/geometry/material state signatures match across forward and reverse visits.
- PNG hashes differ in 9 states. The separately quantified differences involve small GPU edge/shadow variations (14–326 pixels out of 518,400; maximum mean absolute RGB difference approximately 0.0054/255), so exact pixel reproducibility is not claimed.
- `report.json`: camera positions, surface bindings, force routes, field overlays, hip offsets and state signatures.
- `annotation-windows.json`: synthetic line-coordinate visibility samples at 0.1 increments. This identifies available windows; it does not certify a final narration cue duration.
- Fixed shoulder point is visible throughout tested `u=1.3–2.4`; fixed displacement point throughout `u=6.0–7.0`; the mortise lower lip throughout `u=0–1.1`.

## Remaining integration checks

Verify actual narration cue windows, titles, subtitle overlap, group brackets and continuous motion using the main Film timeline. Specifically, delay the first hip label until the entrance camera reaches the hip; do not show it during the four-second chapter travel. A beam-section stress visualization does not establish mortise contact stresses, wood crushing/fracture, pin load sharing or real-building safety.
