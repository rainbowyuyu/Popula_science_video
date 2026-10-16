# V5 rendering checkpoint

The complete V5 video is actively rendering. Do not deliver the old V4 video as V5.

- Formal video target: delivery/GLP1_V5_1080p.mp4.
- Exec render session: 38760. Final marker tmp/final-render.json is written only after the entire render and BT709 verification.
- QA wait session: 97317. It runs qa_final.py --revision v5, then qa_motion_metrics_v4.py --revision v5 after success.
- Current timeline: 25628 frames / 30fps = 854.2666667 seconds (14:14.267), 89 voice clips / 419 captions / 12 second coda.
- Installed timeline SHA: 1c90aaef620540b39687543b065086c100f7d7df338bf92185d9f04a53f9e7c9.
- Installed master SHA: 9bc956e92e973d45da6931bdf19ee1b9b0810652d2d7ac05c0c0dff9dd712a71.
- All 97 installation files verified: audio-installation.json.
- src/public frozen; render-source-lock.json protects active input hashes. Do not modify while rendering.
- Three-agent script and actual-render audits fixed insulin resistance, medication-state matching, pancreatic secretion, liver LDL uptake location, CPAP airway, persistent regulation lines, wall occlusion, measuring garment, cuff trajectory.
- Four new covers generated and viewed, delivery/covers/visual-review-v5.json records hashes.
- Full audiovisual subjective watching/listening NOT completed; records must state actual scope.

After render:
1. Wait for automated QA + motion metric outputs, inspect every scene/transition contact sheet and strongest motion changes. If real defects exist, repair affected ranges and keep exact timeline/audio locked, then recheck final file.
2. Record final-v5/visual-review.json with actual viewed files, timeline/master/video hashes, sampledVisualReviewCompleted and zero open blockers only when earned. Do not claim full subjective listening.
3. Execute scripts/finalize_v5.py, then scripts/package_delivery_v5.py. ZIP: delivery/科学减重与三高-封面文案.zip, manifest research/revision-v5/publishing-package.json.
4. Read and run new cleanup_v5.py preview then --execute only after final gates pass. Never use old cleanup_v4.py against current project.
5. Final response links full MP4, publishing pack and sources, says actual 14:14 duration and concise change/evidence. No partial sample substitution.

Other active workspace project shanghai_tower has its own browser processes. Do not stop or clean them.
