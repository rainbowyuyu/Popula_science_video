# Episode 3 v7 audio workflow

The raw voice remains the user's local rainbow reference clone. The camera timeline follows complete speech, with no tempo adjustment and no fitting to legacy shot durations.

Current edit: 47 narration clips, 8933 frames at 30 fps, 297.7667 seconds. The duplicate whole-pavilion recap (IDs 025–028) was removed after the individual connection demonstrations. Remaining IDs and sentence texts are unchanged; all 51 original raw WAVs remain byte-identical for rollback. The story generator uses stable per-scene starting IDs, and voice generation derives each numeric take's seed from its ID rather than its position in the edited list. See `audio-edit-assembly-removed.json` for the removed rows and before/after hashes.

The current 47-clip audio audit passes full-take sample preservation and detects no strong raw sentence tail missing after processing. Final WAV loudness is −15.53 LUFS; a separate AAC 320 kbps verification encode measures −1.39 dBTP. Subjective listening and pronunciation flags remain false. After future edits, rerun prepare, ASR audit, mix, and final QA; do not reuse these figures as automatic approval.

Run from `D:/python_project/manim_extend_rainbow/video_project/topology_optimization` using `D:/python_project/tts/.venv/Scripts/python.exe`.

```powershell
# Read-only v6 raw/aligned audit; cached by WAV SHA-256.
python scripts/voice_episode3v7.py audit-v6 --asr --device cpu

# Reuse only text-identical, reference-identical, SHA-verified complete v6 raw takes.
python scripts/voice_episode3v7.py import-v6

# Generate changed or missing raw sentences with one stable per-clip seed.
python scripts/voice_episode3v7.py generate

# Partial batches are supported; missing clips are listed explicitly.
python scripts/voice_episode3v7.py audit-raw --threads 3

# A changed sentence can be regenerated alone. Previous audio is archived by SHA.
python scripts/voice_episode3v7.py generate --only 005 --replace-changed --seed 20261105

# Full-take mastering and actual WAV length drive the new timeline.
python scripts/prepare_episode3v7.py --coda-seconds 12 --caption-chars 18

# Verify mastered files and phrase tails, then rebuild captions from ASR anchors.
python scripts/voice_episode3v7.py audit --asr --device cpu
python scripts/prepare_episode3v7.py --coda-seconds 12 --caption-chars 18

# Original pentatonic arrangement, separate stems, final mix and AAC true-peak check.
python scripts/prepare_episode3v7.py --mix-only
```

`python` in this example means the TTS virtual environment's Python, not an arbitrary interpreter. The supplied environment has faster-whisper's CPU path available; the CUDA ASR path currently cannot load `cublas64_12.dll`. Qwen generation uses the existing PyTorch CUDA runtime successfully. Never start duplicate Qwen jobs while one is live.

## Protection and timing

- Measure duration through libsndfile samples/sample rate. Never infer it from WAV file bytes.
- Add 20 ms head protection and 180 ms tail protection outside the original take.
- Apply one conservative master pass from `broadcast_voice.py`; it measures and compensates the filter delay by correlation.
- Keep all source frames. Round the protected mastered length upward to whole video frames; only zero-pad the frame boundary.
- Sentence and scene pauses are explicit timeline values. The references scene gets 12 seconds.
- Subtitle cues use the canonical display text, split into short phrases. ASR word anchors guide timing, with a reported duration-proportional fallback if coverage is insufficient.
- A story/voice SHA check prevents a newly edited sentence from being paired with stale audio.

## Pronunciation and evidence

Rare architecture terms have spoken-only homophone overrides, while text on screen remains correct: 闌额/栏额, 檐栿/檐伏, 櫨枓/卢斗, 枓栱/斗拱, 棖/成, 榀/品, 枋/方. The actual voice must still be checked in context. Do not feed raw pinyin or SSML to an API that does not support it.

Whisper sometimes spells 榫肩 as 损尖 and 托住 as 拖住. Its character mismatch is a review cue, not proof of an audible mistake. Simplified/traditional script differences are normalized, while homophones are not automatically declared correct. No ASR number certifies the voice's tone or subjective quality. Listening flags stay false until an actual listening review occurs.

## Mix

`木作回响·亭下新编` is an original 100 BPM pentatonic synthesized arrangement for this same episode. Its timbres are plucked strings, a light bamboo-like line and soft wooden pulse; it is not represented as an acoustic recording. Music stays about 18 dB below narration during speech as a starting point, with 120 ms lookahead and a smooth 1.1 second recovery. Music and narration remain separate WAV stems.

The mix targets about −15.5 LUFS, checks the produced master, and separately encodes AAC at 320 kbps to measure the encoded true peak. The check requires no more than −1 dBTP. `voice-AB-preview.wav` has matched-loudness raw/processed speech; `mix-preview.wav` includes the opening music bed.
