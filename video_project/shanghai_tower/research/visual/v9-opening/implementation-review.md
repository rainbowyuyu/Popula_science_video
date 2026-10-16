# V9 opening staging and camera review

The opening now keeps a coherent tower and brings eight small study families (22 actual original GLB parts) into a near camera position in narration order: glass → floors → beams → column → outrigger → belt → columns → core. The skin moves in two wings. Previous studies move laterally aside; return order is core, columns/trusses, beams/floors, then facade. The 987-part offline atlas is unaffected.

No original mesh is enlarged, flattened, duplicated or substituted. CPU checks confirm unit scale and exact return to source coordinates. `npm run check`, full CameraPath continuity thresholds and actual-GLB staging checks pass. The source timeline SHA is unchanged.

The prior 8.5–12 s tiny subject problem has been replaced with a glass close-up and timely readable name. Repair stills at F1100/F1190 verify separated chords followed by assembled triangles; F1640/F1700 show a controlled return with only a few displaced groups. F1470 reveals the core cells. Still review is sampled and is not continuous playback certification.

Finalcheck F750 revealed a background glass/brand contrast issue. The final az adjustment was independently verified in the newer spatial-repair bundle: F750 now shows clear foreground beams with no background shell across the brand. The World handover at cue 5 was also reviewed using F1785, F1786, F1800 and F1840 from that newer bundle. F1785 to F1786 preserves building, plaza and shadow continuity; F1800 shows intermediate facade separation and F1840 shows the facade outside the frame with the plaza moving right. These sampled stills resolve the previously pending integration checks. They do not constitute continuous playback certification.

Changed sources: `src/PartsInventory.ts`, `src/CameraPath.ts`. No World, Film, public assets, physics or narration edited by this task. Camera wind cues changed only at 30.10, 30.354, 30.46, 30.678, 30.785, 30.96, 31.2 and 31.5; times and physical slice heights stay fixed.

Evidence and source hashes: `implementation-review.json`, `camera-numerical.json`, `staging-projection.json`. Render batches: `tmp/stills-v9-opening`, `tmp/stills-v9-opening-repair`, `tmp/stills-v9-opening-finalcheck`. Finalcheck bundle: `tmp/render-runs/v9-opening-finalcheck-41156-1791539440410/bundle`. GPU work is complete and released to the parent.

Latest accepted opening integration evidence: `tmp/stills-v9-spatial-repair`; bundle `tmp/render-runs/v9-spatial-repair-34332-1791539939745/bundle`. The separate read-only annotation review is `spatial-integration-review.md`; its remaining soil-label observation does not affect the opening camera acceptance.
