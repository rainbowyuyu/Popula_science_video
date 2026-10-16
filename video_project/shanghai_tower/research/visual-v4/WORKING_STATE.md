# Shanghai Tower v4 active state — 2026-10-09

Goal active. No complete v4 has passed QA. Preserve v3.

Current source: 11515 frames, 383.8333 seconds, 30fps, 1080p. 48 utterances and 195 captions. Eight takes s007,s008,s016,s018,s021,s035,s042,s045 regenerated with standard term text; full fresh ASR and clause alignment done. Content/edge checks passed; subjective tone listening remains unverified. Master/AAC -15.01 LUFS / -1.46 dBTP. No final video yet.

Stopped full renders:
- final-v4 (11458-frame timeline) stopped at ~21%.
- final-v4b-stills PID46728/session40885 stopped at14%. It was accidentally a full render because --stills was not recognized. No valid completion marker. Its bundle: tmp/render-runs/final-v4b-stills-46728-1791491285518/bundle.
- render.mjs now accepts both stills and --stills.

Active work:
- visual_v4_code correcting wind lines over logo/readouts, clutter in core close-up, s032 exterior/camera alignment and dark/noisy TMD background. Review of six frozen frames in current-v4b-review/review.md. Coda passed.
- audio_v4_qa benchmarking process-local Nvidia D3D11. scripts/renderer-options.mjs added, not yet integrated. Default was Intel UHD. Nvidia shots have matching composition with only <1/255 mean pixel differences. Benchmark30frames c2/c3 ongoing.
- tower_model running separate U500=5m/s SA-negative continuation in research. No public promotion. SU2 headers require # COORD; options NEGATIVE,WITHFT2.
- root corrected postprocess_surface.py nodal normals, retains face_outward_normals. Promotion now validates acceptance, axes, unit nodal normals, finite Cp, connectivity.

Current public CFD placeholders acceptedForFilm=false. Prior30m/s RANS and fixedCFL2/0.5 candidates failed convergence. 2DRe100 section is only educational. Six-component coupling driver and validator under one-way-coupling tested synthetic only, not production. Never advertise as accepted real building CFD.

Next:
1 Review visual fixes and Nvidia benchmark.
2 Integrate renderer helper, type/camera/audio checks, record NEW input manifest (v4b manifest predates fixes).
3 Full render explicit --output=ShanghaiTower_1080p_v4.mp4 --tag=final-v4c and selected concurrency.
4 Final encoded QA, motion ranking, sample contacts and actual transition clips. qa_final.py requires matching marker.
5 Correct delivery/制作说明.md draft, finalize only after actual checks.
6 Clear only project reproducible caches after final QA, preserve v3 and scientific sources.
7 Goal remains active until outstanding real-flow requirement and delivery are handled.

Music: original 向云生长 remains; Douyin song unavailable/unknown. Question already asked. Do not claim replacement.
