# V9 spatial annotation and opening integration review

Independent read-only source review and direct image inspection on 2026-10-09. Root-owned sources were not edited. Evidence is limited to the stated frames and source snapshot; this is not a full-film or continuous encoded-video certification.

## Evidence

- Initial spatial bundle: `tmp/render-runs/v9-spatial-review-14304-1791539638197/bundle`; inspected F9747, F10082, F10344 and F10649.
- Repair bundle: `tmp/render-runs/v9-spatial-repair-34332-1791539939745/bundle`; directly inspected all ten frames: F750, F1785, F1786, F1800, F1840, F1936, F4406, F6430, F10344 and F12519.
- Repair manifest: `tmp/stills-v9-spatial-repair/stills.json`.
- Soil-anchor follow-up bundle: `tmp/render-runs/v9-soil-anchor-49532-1791540159061/bundle`; directly inspected F1878/cue5.40, F1936/cue5.65 and F2017/cue6.00. Manifest: `tmp/stills-v9-soil-anchor/stills.json`.

## Verified observations

- F750: the final opening azimuth change clears the former shell/brand collision. The actual fourth-zone beam family is a readable foreground subject.
- F1785/F1786: cue-5 handover preserves building, plaza, soil and shadow positions. Only the expected new subtitle differs materially.
- F1800/F1840: facade has an intermediate separation state, followed by its exit from the sampled frame; plaza moves toward the right edge. No instant geometry replacement is visible in these samples.
- F4406: the three solver displacement values are readable at their corresponding elevations, without collision with the lower-left concept statement.
- F6430: selected member stress label is now above the legend and connects to the selected diagonal. The leader no longer runs through its numeric text.
- F10344: the original wake-label/left-heading collision is repaired. Wake speed is above the legend and section-height label is to the right of the geometry.
- F12519: TMD mass and copper-plate annotations are readable beside the model. Leaders meet the outside edges of lettering. They do not collide with the lower-left concept text.
- F1936: raft label is clear, but the soft-soil label lies over the tower; see remaining observation below.

## Source review

The selected force annotation consumes transformed member endpoints from `MemberForceVisualization.getReadout()`. Member detail offsets finish before its active readout window, avoiding a missing exploded-position term. TMD mass and copper plate now use `center + root.position` and are marked registered, avoiding a second generic displacement. The spatial layer updates after world transforms and `updateMatrixWorld(true)`.

Displacement numbers use unamplified solver arrays. Displayed displacement remains explicitly identified as 48x. The measurement collars are described in source as explanatory rings, not claimed physical cross-section boundaries.

The previous fixed anchor x/y cull was replaced by continuous offscreen label travel. Text now ignores geometry depth while leaders and dots retain depth, keeping labels readable and preserving the physical anchor. Independent actual text width controls the leader endpoint. The fixed flow legend has an explicit label-height reservation. This addresses the reported edge-pop and known legend overlap mechanisms; no general collision solver is present, so later camera/layout changes still require image checks.

## Soil-label follow-up

**Original repair F1936, soft-soil label:** the text was around x1170/y330 over the building, and its leader was mostly hidden by foreground members. Root corrected the anchor to the actual weak-soil layer's mid-depth on the right cut surface, transformed by the soil model matrix and excluded from tower displacement.

**Follow-up F1878/cue5.40 and F1936/cue5.65:** corrected. The gold dot is on the visible brown soil surface, the leader is visible, and the right-margin text clears the building.

**Follow-up F2017/cue6.00:** text remains clear, but camera descent lets the basement wall occlude the actual soil anchor. The visible gold line then emerges beside the basement wall, which can still imply a wall label. Recommendation sent to root: end only the soft-soil label window near cue5.85, when the explanation and descent turn toward the piles; retain the raft label if needed. This avoids moving the anchor to an incorrect soil depth. A later source-window correction requires its own verification and is not yet represented by this render batch.

**Final source correction, verified read-only:** `World.ts:428` now sets the soft-soil window to `[5.3, 5.85]`, with its existing pulse reaching zero smoothly over cue5.74–5.85; raft remains `[5.3, 6.12]`. Thus the misleading cue6.0 soil label is removed by the current source logic. No follow-up cue6.0 frame or continuous motion was rendered after this final label-window change. Status: source fix verified, future integrated-motion review pending. Final `src/World.ts` SHA-256 is `c9c5fbf9d9deb68190e15cdce858b05120402f7e7767f1c2cf7642f79ddda425`.

Follow-up source hashes: `src/SpatialEngineering.ts` = `35557623530f5fb6cb0c077e62d918a0c5748787946a7ccb0675feff4d5abdd3`; `src/World.ts` = `e60f0389db786e793b229c815ec3e772007a4c0451ea9b5e9d908b1f9da4c5be`.

## Delivery scope

This is a saved visual implementation awaiting integration with the correct model. No new complete V9 movie was exported or certified by this task. Reviewed draft stills must not be represented as a verified final feature-length output.

## Snapshot hashes

These hashes describe the read-only source snapshot inspected after the repair still batch; the bundle manifest is the authority for the rendered evidence.

| Source | SHA-256 |
| --- | --- |
| `src/PartsInventory.ts` | `969e36d1865e9ad79538a46c3ab7c26c37fdb3bfa6de4565992f95865d118191` |
| `src/CameraPath.ts` | `30a9229b2105fe6fff6fef98363685b3fd09adea14b1a8bc38c62ae5a326634c` |
| `src/SpatialEngineering.ts` | `aa474ae307e0da6fa2c392f25ad96fc65a9f9f15c1f3b4470637c4b921e40c19` |
| `src/World.ts` | `eb0acf59ada0868ad581a4fb9f3b4c2248b04c7b39f4b9af05d620c1b5c74956` |
| `src/Film.tsx` | `3a41b1c564675f154981fd52873f6a0c373c121c747596fa2fa6d3459cb9e68f` |
| `src/ComputedFlowSlices.ts` | `3da2a1691e6416e3b2cc9b53af06bc68e55a744926df2f5466f7759517e77e05` |
| `src/MemberForceVisualization.ts` | `180a74c1ec70a9ea00da5fa859dba6d41baac1477c97acfc505c0fb772712b0d` |
| `src/PhysicsPlayback.ts` | `51a22aa390d71e47c1291a0075ca4aaea3bb462462d6c4c693b8ab2083796d82` |
| `src/timeline.json` | `b641306d6ca1a5c9cfb520dee66a54a1d76d6cbd510b7381cfd64902c6bfcd5e` |
