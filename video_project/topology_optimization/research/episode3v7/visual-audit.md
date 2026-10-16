# Episode 3 v7 — independent camera and visibility audit

**Editorial update, 12:01 local:** the duplicate assembly recap (original IDs 025–028, 810 frames) has been removed. Current duration is 8933 frames / 297.7667 seconds. Hip now connects directly to gravity at frame 4484. Historical findings below retain their original frame numbers; for final-media checks use `visual-qa/final-sample-plan.json`, regenerated for the shortened timeline (126 samples, nine transitions). The final media has not yet been decoded or reviewed. The audio retime/remix is verified separately in `audio-final-qa.json`.

## Final source recheck — 2026-10-05 11:44 local

This section supersedes the initial findings below. The earlier findings remain as a traceable repair record.

- Current World hash: `5057a924bc5ad76d8af68955d6f273ce4b0e645883e4b938d9f6cc8b29ac9f19`.
- Film hash: `45250f35dd133e7138040e6fa38ab1bb44920aa0e61c91357d2bbabb9ef4a978`.
- Locked manifest: `84bfcdc036c9eb13ee57f8931bed31440bba06d2ece3187d032fdd6732634488`; GLB: `60154242cbd467edf577c76d01d0b8f08e40423c9db975c9fbd5e36194245f2d`.
- Re-evaluated all 9743 frames. No camera was inside or within 0.12 m of any part AABB. Largest scene-boundary part-position difference was 2.69 micrometres, not a visible jump.
- Per-part path-distance parameterization, an earlier outgoing roof breakdown, and a seven-second assembly handoff eliminate the former 2–3 m/frame transition moves. The straight-scene part peak is now 0.0165 m/frame (2.3 px/frame); the assembly handoff peak is 0.411 m/frame (28.0 px/frame).
- Camera composition now has its own time-based easing. The temporary q-induced spikes are gone. Intro camera peak is 0.148 m/frame; bracket peak is 0.169 m/frame. The 0.369 m/frame peak around frame 771 belongs to the smooth four-second wide-to-detail approach, with neighbouring frames at essentially the same speed.
- The HIP_FL exit was shortened along the same verified path. At frame 4185 its visible end reaches x≈841, versus only x≈119 before; the hub and exiting end can now coexist in the close view.
- Current 11:37–11:38 stills were reviewed as `visual-qa/locked-stills-contact.jpg`: 285, 787, 1640, 2390, 3170, 3470, 4020, 4190, 4520, 4760, 5680, 5900, 6810, 7300, 8560, 9410, 9550. These precede the final intro/bracket camera decoupling and HIP_FL exit shortening, so they verify improved detail and stress framing, not the final timing changes.
- Frame 5680 now makes the front beam's signed tension/compression visible, with a lowered camera and translucent roof; the former roof-dominated bending shot is resolved. Bracket and hub mechanisms are larger and centred. PhysicsKey now has a scene-end exit motion.

**Source-check outcome:** no new blocking camera-position or scene-boundary defect found. Proceed to final render and media validation. This is not final-video playback certification.

Remaining aesthetic observation for real-time playback: at frame 2970 GONG_Y_FL moves from screen y≈36.5 to −89.0 in one frame (125.5 px) during its upward exit. The part remains present and crosses the viewport edge continuously; verify that the exit speed feels appropriate in motion. The intro hook's fastest visible part moves about 53–58 px/frame. Neither finding is a hidden mesh toggle.

## Initial repair audit

Audit date: 2026-10-05. Scope: read-only inspection of camera paths, part motion, framing, overlays, and current visual samples. No main composition or model file was changed by this audit.

## Evidence and version boundaries

- Imported camera and assembly-offset methods directly from a TypeScript snapshot of `src/episode3v7/World.ts`; evaluated every frame from 0 through 9742 against the actual audio timeline.
- Source snapshot: World `87828ca098d5d3a3738e0c28eb549a12575eaa428393500d2162a29afdad288b`; Film `29f290b68f095c6547c1d63ebeee582a4fae5811d8407d73074a6c291eed497d`; timeline `4267bc7176c4c1b9b2f230e83dfc942c4197ee4d8c9e2f1c8873c5bab725a71c`.
- Manifest snapshot `2fa7a9465864328a2fc92afd9bec8a5a86a6323fc5dab2a58afad2aadf0be067`, modified 11:16 local time. Exact metadata and results are in `visual-qa/camera-audit.json`.
- Visually inspected the new `output/episode3v7/current-contact.jpg`, containing frames 330, 1100, 1560, 2340, 3100, 3450, 4020, 4950, 5660, 6100, 6800, 7210, 8170, 8500, and 9490. Full-resolution close inspection: 1560, 3100, 4020, 5660.
- Extracted `segment-650-820.mp4` (171 frames / 5.7 seconds / 1080p30). This video was written at 11:12, before the 11:16 model-manifest update. It shows camera behavior but cannot certify the latest geometry. Extracted frames and contact sheet are under `visual-qa/`.
- The 10:58 and 11:02 draft images were not used as final validation.
- This is not a full playback or audio listening sign-off. Later source changes require a new targeted check.

## Findings that should be fixed before final render

### 1. [High] Some parts travel several metres in one frame during a continuous scene transition

Location: `World.ts:116`, global `q` interpolation in `blendedPose`.

The scene boundaries themselves are position-continuous. The problem occurs inside the 2.5-second blend: global q rapidly traverses narrow per-part assembly windows. Examples from the audited manifest:

| Frame / time | Part | Translation in one frame |
|---|---|---:|
| 738 / 24.60 s | SUPPORT_Y | 2.87 m |
| 735 / 24.50 s | HUB | 2.60 m |
| 4508 / 150.27 s | CENTRE_POST | 2.76 m |
| 4511 / 150.37 s | SUPPORT_X | 2.70 m |

These are motion discontinuity risks perceptually, even though every mesh remains mounted. A roof support crossing metres in 33 ms can look like it vanished. Maximum camera movement is 0.340 m/frame near frame 749, compounding the effect.

Recommendation: reparameterize q using cumulative actual part travel, or blend each part's evaluated position between the outgoing and incoming poses instead of rapidly sweeping the entire assembly program. Preserve contact order. Verify the fastest affected parts at every intervening frame, not only endpoints.

### 2. [High] Physics labels disappear at boundaries without an outgoing movement

Location: `Film.tsx:31–35`, `PhysicsKey`.

- Frame 6268 / 208.93 s, gravity → wind: the visible old upper label and lower legend are reset to offscreen entry coordinates immediately.
- Frame 7579 / 252.63 s, wind → inverse: the wind legend unmounts immediately and the upper label resets.
- Frame 8759 / 291.97 s, inverse → return: `if(!labels[s.scene]) return null` removes the visible label immediately.

Recommendation: finish an outgoing horizontal motion during the final 1.1–1.4 seconds of each physics scene; then mount the next label outside the viewport. Alternatively keep outgoing and incoming overlay instances simultaneously until their departure/entry completes. This is independent of the smooth Three.js camera path.

### 3. [Medium] The joint cameras are too wide; the bracket focus is intentionally offset above the actual joint

Locations: `World.ts:98–103` and the final target adjustment at line 114.

This is **not a glTF coordinate-baking bug**. The actual GLB accessor bounds plus node transforms match `bbox_three` for POST_FL, GONG_X_FL, and HUB. For example, GONG_X_FL's node translation is approximately `[-1.5, 3.81, 1.5]`, and its local x bounds ±0.32 produce the expected 0.64-m span.

At frame 3100 / 103.33 s, the bracket joint sits well below the empty centre of the image. Its rest y is 3.81, while the camera target is raised by the bracket-specific +0.27 and the global +0.12, yielding approximately y 4.20. At 4.7 m distance this shifts the mechanism downward roughly 146 pixels. The rest of the pavilion occupies much of the frame and competes with the explained detail.

At frame 4020 / 134.00 s, the hub is only about 150–180 px wide despite the narration discussing separate end slots. At a 7.8-m distance a 0.64-m hub is too small for those slots. Floated rafters occupy the top and the intended joint falls into the lower half.

Suggested camera targets, subject to rendered verification:

- Bracket detail after parts settle: target `[-1.5, 3.81–3.90, 1.5]`, distance 2.5–2.9 m, elevation 0.25–0.40. Remove the automatic +0.27; keep the +0.12 global offset for wide compositions only. While a selected part is descending, track a weighted centre of that active part and the receiving surface, then settle into the close view.
- Hub detail during lines 1–2: target `[0, 4.97–5.03, 0]`, distance 3.2–3.8 m, elevation 0.45–0.55. Aim between adjacent diagonal beams, then pull back during the rafter/roof sentence. AABB rays flag HIP_FR ahead of the hub at frames 3870 and 4140; this is a conservative occlusion warning, not a triangle-level intersection claim.
- Pin insertion at frames 1536–1884 / 51.20–62.80 s: a 0.028-m peg is about 10–12 px thick in frame 1560. Briefly push to 1.5–1.9 m around the actual moving peg/hole, then return to a wider frame. Keep the side-on insertion axis legible.

### 4. [High] The bending explanation is visually dominated by an opaque roof

Locations: `World.ts:105–108` for gravity camera; `World.ts:132` and force-line updates near 176 for depth testing.

Confirmed in frame 5660 / 188.67 s. The subtitle says “梁承受弯曲：一边受压，一边受拉”, while the roof occupies most of the picture. Internal beam force paths use `depthTest:false` and draw over the opaque tiles; this reads as lines placed on the roof and does not explain the beam's upper and lower fibres.

Recommendation: time a downward camera move to the front crossbeam for the bending sentence. A starting range is target y ≈3.0, elevation 0.05–0.12, distance 5–6 m, followed by a return to the load path. A continuous roof peel/lift or carefully restricted transparency is another option. Show tension/compression only using the actual signed result being described; the existing whole-member maximum-absolute-stress colour alone does not identify the two sides.

## Checks that passed in this snapshot

- No camera position was inside, or within 0.12 m of, any translated part AABB across all 9743 frames. This is a conservative rest-geometry check; deformation was not included.
- All ten scene boundaries preserve q and part translations to numerical precision. No `visible` toggle was found on the pavilion parts. This does not eliminate the within-transition speed issue described above.
- Logo and its adjacent wordmark remain in the specified upper-left position. The inspected current frames show no clipped logo.
- The inspected captions are large and readable, and no essential connection point is covered in the four full-resolution detail checks. The shot selection/framing issues above are more significant than text styling at this stage.
- Frame 9490 keeps two actual paper pages as full-page cards with captions below them. The 12-second references scene provides more dwell than the old five-second treatment. No frame-9490 text/card overlap was observed in the contact sheet.

## Recheck list after the root fixes

Render short ranges around 711, 1891, 2840, 3711, 4484, 5294, 6268, 7579, 8759, and 9383, including at least the first 3 seconds after each boundary. Recheck the bracket/pin/hub close views and the bending sentence. Run `node research/episode3v7/visual-qa/audit-camera.mjs` again only after the current main edits are stable, and keep the updated source hashes with the report.

## Final encoded-media review — 2026-10-05

This section supersedes the earlier snapshot findings for final-media disposition. The source and assembly recap changed after the initial audit; the earlier frame numbers are historical.

Artifact: `output/episode3v7/joinery_v7_1080p.mp4`, SHA-256 `bd04b5794dd0e81d7cd629ef8a20c087c5a345236e8377a9e53277da8ee5d60f`.

- Automated report: `visual-qa/final/final-media-audit.json`, `machine_checks_pass=true`. H.264/yuv420p, 1920×1080, 30 fps, 8933 video frames, 297.766667 seconds of video. Container/audio duration 297.813333 seconds includes AAC padding.
- Full-file decode succeeded with no corrupt frames or detected black intervals. Encoded audio measured −15.55 LUFS and −1.46 dBTP. All 47 expected narration windows matched the approved master; minimum waveform correlation was 0.9999743 after accounting for encoder lag. This verifies retained signal, not subjective listening quality.
- Visually inspected all seven final contact sheets, covering 126 exact decoded frames. These include samples around all nine scene boundaries, joint macro views, force/stress scenes and the references. Source-frame mapping is saved in `visual-qa/final/frames/frame-index.json`.
- Within the sampled frames, no blocking geometry/assembly discontinuity or unexpected black frame was found. Stress overlays follow the model; the roof transparency exposes the beam response. Reference cards show full paper pages with captions below, and the final reference scene lasts 12 seconds.
- **Remaining medium aesthetic finding:** frame 830 / 27.667 seconds has title/timber overlap during the approach to the straight-tenon scene. The lower part of “榫头，怎样装进去”, especially “进去”, falls over a horizontal brown beam. The title remains readable but does not fully meet the requested text/model separation. Confirmed at full 1920×1080 resolution in `visual-qa/final/detail-830.png`; similar overlap appears in samples 771, 801 and 831. This does not block file playback or the illustrated assembly, but should not be represented as flawless visual QA.
- **Limitations:** no complete real-time motion playback and no complete human audio listening pass were performed by this reviewer. Discrete contact-sheet samples cannot certify every intervening frame's aesthetics or motion smoothness. No video-source changes or rerender were made during this final audit.

### Targeted title-timing repair review

Root moved the straight-tenon chapter title to the preceding wide shot and scheduled its leftward exit before the close camera approach. Reviewed the newly supplied stills `output/episode3v7/frame-{665,681,711,735,751,771,801,830}.jpg` at full display size:

- Frame 665 shows the title entering from the right edge, above the separated timber.
- Frames 681, 711 and 735 keep the title in the upper-left negative space, visibly separated from the roof and beams.
- By frame 751 the title is outside the image; frames 771, 801 and 830 show the close approach without the previously overlapping title.
- The targeted repair passes in these eight new render samples. No new title/model overlap is visible in them. This validates the repair frames only; the previously hashed encoded MP4 requires replacement by the root's updated render before this repair can be attributed to that delivered file. No full decode or rerender was performed by this reviewer.
