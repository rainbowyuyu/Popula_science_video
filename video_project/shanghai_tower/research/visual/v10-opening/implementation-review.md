# V10 opening and camera implementation review

Status: CPU checks pass. Two frozen V10 opening clips and their dense frame sequences have been visually reviewed. A later exact-geometry review identified and fixed several handover collisions; those final rear-lane changes await the parent's new-bundle rendered checks. Whole-film acceptance with the final physical data remains separate.

## Changes

1. `PartsInventory` accepts the film timeline and interpolates motion in actual seconds. The former narration-relative ramps changed real velocity when an action crossed different-length clips. Actual-GLB audit found a 2.3657 scene-unit/s center-velocity jump at cue4 and a 0.4946 jump at cue3. The current maximum at all authored motion boundaries is 4.43e-7, within numerical differentiation noise.
2. `CameraPath` retains the bridge column's center and enough distance until its sideways exit. It then travels into the truss close-up with a moderated arrival radius. The column's lower bound previously reached y1001 in a stable-hold sample, entering the subtitle band; current held samples remain around y792–812.
3. The two-column study rotates as one original assembly to show both columns side-by-side. Its original camera-facing width was only 78–95px because the two columns overlapped in depth; the final width is 287–402px while retreating along the rear lane. Geometry and original spacing are unchanged.

4. Floor, truss, belt and core arrival windows overlap their predecessors' lateral exits. First-pass F904 was empty; current F904 shows the complete separated truss when narration begins. F1435 now starts on the arrived core. Label timing follows these handovers.
5. The outgoing paired columns and core park laterally at midheight. The entering beam stack uses a shallow dip that is zero at both endpoints. Actual renders confirmed and corrected earlier study-piece collisions with the brand at F699, F1420, F1572 and F1599.
6. The core-to-tower return widens earlier: cue4.20 radius3.4, cue4.40 radius8.6 and target(.85,2.75,.45). This improves F1572's centered framing while retaining the continuous return-to-foundation path. F1700 shows orderly family reassembly; F1785 reaches the foundation without an empty screen.
7. Exact-geometry checks found a one-frame column/core collision at F1414 and brief intersections in the glass-to-floor, floor-to-beam and beam-to-column handovers. These four outgoing groups now move smoothly into separate rear lanes before crossing laterally. The broad groups also move slightly down to keep the brand margin clear. All seven consecutive study handover windows now have zero mesh OBB overlaps at every frame, so they have no inter-group mesh intersections. Internal joints within each assembly and the full tower's return contacts are outside this test's scope.

All other V9 decisions are retained: 22 actual originals across eight studies, coherent facade wings, lateral predecessor exits, controlled return by family, no 987-piece scatter, and original-scale geometry. World/Film, source mesh geometry and solver data were not edited by this task.

## Integration

The parent integrates `new PartsInventory(this.parts, this.path.tl)` in World. The optional legacy constructor continues to work for anchor-only tooling, but actual motion must receive the timeline to get the true-time fix.

The new core-shell solver may alter section visuals and physical response while the GLB body is substantially retained. Whole-film acceptance therefore still requires visual checks with the final physical data. The camera numerical report covers the authored path, not World's added structural-follow displacement.

## CPU validation

- `npm run check` passed after the final source changes.
- `node scripts/check_camera.mjs --out=research/visual/v10-opening/camera-numerical-current.json` passed across all 15,712 frames. All anchors resolved; source inputs remained stable. Peak normalized camera speed 0.59648 <= 0.6; target speed 0.54390 <= 0.55; peak log-radius rate 0.50681 <= 0.55. Camera knot velocity continuity passed.
- `node research/visual/v10-opening/check-opening-motion.mjs` used the actual 987-part GLB. All transforms are finite, every mesh remains at unit scale, all originals return to rest with error 0, and all eight studies' held-view bounding boxes fit the defined safe viewport at sampled intervals.
- Study projections use transformed original bounding boxes. They conservatively describe scale and framing; they do not certify mesh visibility through other parts or aesthetic quality.
- Minimum handover visible source-box area22,573px²; no sampled small/absent subject below7,000px². Selected-study brand bbox intersections0 at three-frame intervals; this excludes the main facade background.
- Baseline and current reports are separate: `opening-motion-baseline.json`, `opening-motion-current.json`, `camera-numerical-baseline.json`, `camera-numerical-current.json`.

## Required visual acceptance

See `key-motion-windows.json` and `key-motion-windows.md` for cue/frame/second ranges, first-batch stills, and the final encoded-boundary checklist. Priority windows are column-to-truss, columns-to-core, return-to-foundation, new core response, member force, flow sections and TMD motion.

GPU rendering completed and GPU was released to the parent. Pre-collision-fix still bundle manifest: `tmp/stills-v10-opening-return-framed/stills.json`. Directly inspected its frames904,1435,1530,1572,1599,1700,1785. Earlier V10 handover batches also inspected every frame590,750,875,904,936,1190,1220,1320,1380,1420,1435,1470, plus direct brand probes699 and1599. These pictures predate the final four rear-lane additions, so they are explicitly intermediate evidence.

Two encoded clips use that identical frozen still bundle:

| Clip | Frames | Video length | Format | SHA256 |
| --- | --- | --- | --- | --- |
| `research/qa/v10-opening/column-to-truss.mp4` |850–945|3.200s|1440×810,30fps,H.264+AAC|`679a3759afdc169f5f5c78079bcb448b4fd7c47ba900454e91a0492eec6b5537`|
| `research/qa/v10-opening/columns-to-core.mp4` |1395–1470|2.533s|1440×810,30fps,H.264+AAC|`b899c61c15895ffb6209d9b5cf3941eb0f293b36cc69bf3b66faa2f05278a258`|

`research/qa/v10-opening/motion-render.json` binds the clips to the bundle. `motion-frame-review.json` records ffprobe and sampling metadata. Contact sheets and individual frames were extracted at three-frame steps:32 samples for column-to-truss,26 for columns-to-core. Both complete contact sequences were inspected. This is dense frame stepping, not a claim of real-time playback or listening.

Observed: the column leaves left while the truss arrives and remains visible throughout the handover. The camera gradually enlarges the truss across F904, without an empty frame or position jump. The two columns read separately, the core passes into the focus bay, the columns exit sideways, and the core remains centered across F1435. Labels stay separate from subtitles.

The apparent core/column overlap at F1407–1416 was checked using actual GLB geometry every frame1395–1425. The first pass showed combined-cell OBB overlap at F1411–1414. Both-direction segment/triangle surface queries found0 surface intersections at1411–1413, but1878 triangle-pair intersections at1414. The paired columns now retreat0.75scene-unit along-Z before lateral crossing; the repeated local test has zero mesh OBB overlaps. `check-all-relay-depth.mjs` then checked all seven adjacent-study handovers per frame, screened OBBs and tested actual triangle surfaces only for suspects. It found glass/floor intersections at600–608, floor/beam intersections at704–724, and beam/column intersections at778–782. Rear lanes were added to these three outgoing groups; final `all-relay-depth.json` has zero OBB overlaps in all seven windows. The first broad scan is preserved as `all-relay-depth-before-lanes.json`. `core-relay-depth.json` records the fixed pair separately.

Parent final-render queue was asked to include600,710,779,1380,1414,904,1435 to verify the new paths aesthetically. No further GPU task was launched by this subagent after releasing the renderer.

F1530 still has a main-facade wing passing behind the fixed brand while pulling back. Parent subsequently added a light soft outline to logo and brand text; that change is NOT in these frozen clips. Verify F1530 in the final bundle. The tower's upper portion is outside the frame during the detail-to-overview move; its crown is visible at F1700. Do not describe all intermediate frames as full-building shots.

A complete final MP4 and final-file-bound review with the new core-shell physical data are still required. The successful opening previews do not certify later response sections or scientific validity.

## Source binding

- `src/PartsInventory.ts`: `1a9f7eba7d855c6756c7d8eee515b9a516ab3d43717edab008c3d95b67e0b7c1`
- `src/CameraPath.ts`: `0e32fe301252cebe95b67f355b01c6f2aeb8ad1fb64a4ae3efbd46eaa37fc637`
- `src/timeline.json`: `b641306d6ca1a5c9cfb520dee66a54a1d76d6cbd510b7381cfd64902c6bfcd5e`
- `public/models/shanghai-tower.glb`: `b9cacbeb3c044bce06b122601539c6e514888ab0751889f22d7a9c3fc7267123`
- `public/models/shanghai-tower-manifest.json`: `8a8ccb5c9e31ad0602279479f1c9f9b79747721d533b47c7a51561747785d142`
