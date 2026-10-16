# V8 narration and piano handoff

Frozen timing: 26,738 frames at 30 fps = 891.2666667 s (14:51.267).

## Frozen source identities

- story-v8.json: `2dce3434a10d8c95d120f130eaf6f8545a94283b9ca2d5c5801e41b6df90b9c7`
- staged/timeline.json: `140ebffb3099313acc0556c3e37658b47a5b005fe1e3d7c50a8a5675791050be`
- staged/narration.wav: `274e50d1a01a7a57563901b672abd882d889a8f2f53a725d087a3d86cf9c76d6`

## Voice and timing

19 of 89 sentences changed, assembled from 40 full immutable parts. Original generated fragments remain available. New fragments have 80 ms leading and 160 ms trailing processing guards; selected raw tails are at least 60 ms. No silence trimming, time stretch, pitch shift, or hard gate. The complete source waveform in each sentence equals its narration placement sample-for-sample before mix mastering.

h026/h027 explain the two-amino-acid cleavage and drug design more fully. LDL is introduced in Chinese and all LDL speech uses the full Chinese name. Emergency telephone 120 is spoken 幺二零急救电话. h045 now says 低密度脂蛋白偏高, avoiding 高低 ambiguity. h073 selected a fresh full sentence whose unprompted ASR better preserves 淤滞. h007/h054/h058/h064 alternate candidates remain unselected because their recognition did not demonstrate an improvement. This is evidence screening, not listening approval.

428 captions use existing relative timings for unchanged takes and new unprompted no-VAD word alignment for changed takes. LDL is expanded only in the alignment layer; standard captions remain unchanged. Caption alignment warnings are empty. Camera helpers include voiceEndSeconds, spokenEndSeconds, voiceDurationSeconds and absolute per-part voiceParts. voiceEndSeconds is the full measured WAV end, including its processing guard.

h027 originally budgeted 4 extra seconds in place of the old 3 seconds. The final onset revision absorbs 4 frames from that observation allocation and 3 frames from h037, while preserving every shot start/end and all 26,738 frames. h027 now ends speech at 277.8266667 s and retains 4.0733333 s until its shot end; h037 ends speech at 380.50675 s. The measured additional-pause metadata reflects these absorbed frames. No voice samples were trimmed. h001 starts speaking at 0.4 s; its total opening shot remains 9.5 s. There is no long silent opening.

| Shot | Start | Voice end | Shot end | Extra pause |
|---|---:|---:|---:|---:|
|h001|0.4000|8.4800|9.9000|1.2000|
|h007|55.7000|64.1800|67.4000|3.0000|
|h020|175.2667|184.0667|189.3000|5.0000|
|h025|228.3333|237.4533|240.6667|3.0000|
|h027|259.2667|277.8267|281.9000|3.8667|
|h037|370.6667|380.5068|382.6333|1.9000|
|h045|453.4000|465.0001|465.2333|0.0000|
|h073|715.8333|725.1133|725.3333|0.0000|
|h077|753.8333|764.7933|765.0000|0.0000|
|h089|870.1000|879.0600|879.2667|0.0000|

## Installation and final verification

Use install_audio.py first without arguments to validate the plan, then with --install when the parent is ready. It checks that src/timeline.json already equals the frozen staged timeline, installs only voice/narration/music/master WAV files and does not rewrite timeline/captions. Changed production audio gets a recoverable hard-link backup before an atomic replacement.

The selected final mix is music-final. Its piano stem is exactly the selected music-candidate-02 recording; only the three safer onsets were replaced in narration before one final mastering pass. It retains the user-selected Lemon Tree recording at original speed and pitch, with long musical phrases, four-beat estimated compatible overlaps, slow content-based ducking, modest lifts over long observation holds, and the original natural coda. The final bridge occurs at 798.99864 s and keeps the last 91.18293 seconds of the original performance; its numerical chroma match is 0.925, which is supporting evidence rather than listening approval. The source music SHA is 42d9f922ce491372e1bc3585043f9add401f9ed4d94fb986b90a5ba2da5372a1.

For final delivery, run verify_final_mp4.py --video <final.mp4> --out <fresh-check-folder>. It compares decoded AAC against the frozen V8 master every five seconds, including lag search, duration, loudness and true-peak checks. Do not use the V7 verifier.

No subjective listening was completed. ASR, hashes, spectral similarity and waveform alignment do not certify pleasing sound or correct Mandarin tones. A/B samples and mixed previews are saved for actual listening.

## Final installed mix

- master.wav SHA256: `230dc1a7f66edc45dfd45d6bdb065e7bbefad6d64f331f9a74d82a7171135844`
- music.wav SHA256: `8f9386c623e9b58dfe22e0c6455b29179a5e07026131f8367f2f86be592e9938`
- AAC preview: -15.04 LUFS, -1.92 dBTP, LRA 2.9 LU.
- 92 production audio targets checked; 22 changed. The installation did not write the timeline.
- 276 src/public/story files frozen in installation.json. Final video verification will check that these hashes have not changed.
- Complete lock summary: final-lock.json.

## Generated-file cleanup

Seven superseded full-length V8 mix/filtered intermediates were removed after final installation, releasing 904.37 MiB. The final music-final stems, V7 outputs, all raw speech, selected narration, short comparisons and provenance reports remain. The exact cleanup list is superseded-music-cleanup.json.

## Authorized camera-only freeze revision

The interrupted partial render exposed head clipping while the character stands in h068 and h088. After the camera owner completed the final framing check, only `src/V5CameraPath.ts` was re-frozen: `07208a7ace3c317a1b491c4d5713b9b01a6d416323f4d5022eb65066b98f2a9a` → `924b9a64b2d11559015d035957620ebb6aa0c4a507c798ecb65783bfcaa38954`. Every other protected file (275) matched the prior freeze, including narration, music, master, timeline and story. The former manifests and notes are preserved in `freeze-before-h068-h088-camera-fix`; the exact revision is `camera-freeze-revision.json`. Final video target: `tmp/v8-full-corrected/GLP1_V8_1080p.mp4`.

## Final encoded MP4 audio verification

`tmp/v8-full-corrected/GLP1_V8_1080p.mp4` passed the read-only decoded-waveform check. Video SHA256: `e0bf5ce3ff401f7c7d1023d2a0916f08e0396854d7a5b671c161abc600887c80`. All 179 windows selected zero lag at the 0.125 ms search resolution; lowest zero-lag correlation was 0.999841715. Actual encoded loudness is -15.05 LUFS, true peak -1.68 dBTP, and LRA 2.9 LU. The decoded audio covers all 42,780,800 master sample positions in time; AAC remains lossy rather than bit-exact PCM. There are 896 additional encoder-tail samples, with peak at the report floor of −240 dBFS. All frozen inputs are unchanged.

The initial verifier encountered a near-zero denominator during lag search in the final 1.267 seconds. That diagnostic and the original verifier are retained in `final-mp4-check`. The corrected verifier records both reference and actual RMS, directly recomputes low-energy candidate dot products and energy, and excludes lag candidates over 60 dB quieter than the reference. It does not clamp correlation coefficients or skip this last window. The final window has reference RMS -79.8212 dBFS and actual RMS -79.8403 dBFS; zero-lag correlation is 0.999951843. No media or source files changed during either check. The final report is `final-mp4-check/verification.json`; subjective listening remains unclaimed.
