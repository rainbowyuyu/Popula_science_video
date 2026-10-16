"""Assemble V4 short TTS takes, measured captions and a frame-exact voice stem."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, sosfiltfilt, butter

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "research/nobel2026/v4/narration.json"
RAW = ROOT / "public/nobel2026/audio-v4/raw"
AUDIO = ROOT / "public/nobel2026/audio-v4"
TIMELINE = ROOT / "src/nobel2026/timeline-v4.json"
BASELINE = ROOT / "src/nobel2026/timeline-v3.json"
FPS, SR = 30, 48_000
FRAME_SAMPLES = SR // FPS
INNER_GAP = int(round(.14 * SR))
BEAT_GAP = int(round(.22 * SR))
CODA_FRAMES = 7 * FPS


def sha(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()


def load_take(file: Path) -> np.ndarray:
    x, sr = sf.read(file, dtype="float32", always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        from math import gcd
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g).astype(np.float32)
    # Zero phase, light sub-bass cleanup; no look-ahead denoiser or hard trim.
    x = sosfiltfilt(butter(2, 65, btype="highpass", fs=SR, output="sos"), x).astype(np.float32)
    return np.column_stack((x, x))


def speech_bounds(take: np.ndarray) -> tuple[int, int]:
    """Find only the audible onset/tail for subtitle timing; keep audio intact."""
    mono = take.mean(axis=1)
    window = int(.01 * SR)
    usable = len(mono) // window * window
    rms = np.sqrt(np.mean(mono[:usable].reshape(-1, window) ** 2, axis=1))
    threshold = max(.003, min(.006, float(rms.max()) * .05))
    active = np.flatnonzero(rms >= threshold)
    if not len(active):
        return 0, len(take)
    return int(active[0] * window), min(len(take), int((active[-1] + 1) * window))


def main() -> None:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    old = json.loads(BASELINE.read_text(encoding="utf-8"))
    old_by = {c["id"]: c for c in old["clips"]}
    AUDIO.mkdir(parents=True, exist_ok=True)
    # Preload once, save a QA report of any take that sounds active at its end.
    raw: dict[str, np.ndarray] = {}
    tails: list[dict] = []
    for clip in spec["clips"]:
        for p in clip["pieces"]:
            file = RAW / f"{p['id']}.wav"
            if not file.is_file():
                raise FileNotFoundError(file)
            x = load_take(file)
            raw[p["id"]] = x
            last = x[-int(.08 * SR):]
            prior = x[-int(.36 * SR):-int(.12 * SR)]
            rms_last = float(np.sqrt(np.mean(last**2)))
            rms_prior = float(np.sqrt(np.mean(prior**2))) if len(prior) else 0.0
            tails.append({"id": p["id"], "last80msRMS": rms_last,
                          "prior240msRMS": rms_prior,
                          "potentialCut": rms_last > .018 and rms_last > .55 * rms_prior})

    all_clips = []
    pieces_manifest = []
    cursor_frame = 0
    voice_events: list[tuple[int, np.ndarray]] = []
    for clip in spec["clips"]:
        rid = clip["id"]
        baseline = old_by[rid]
        start_frame = cursor_frame
        local_cursor = 0
        caption_parts = []
        for index, p in enumerate(clip["pieces"]):
            take = raw[p["id"]]
            local_from = local_cursor
            local_to = local_cursor + len(take)
            first_active, last_active = speech_bounds(take)
            caption_from = local_from + max(0, first_active - int(.07 * SR))
            # FilmV4 retains the final phrase for 0.12 s after `end`; account
            # for that here so the visible tail stays within ~0.15 s.
            tail_hold = .02 if index + 1 == len(clip["pieces"]) else .12
            caption_to = local_from + min(len(take) + int(.04 * SR), last_active + int(tail_hold * SR))
            caption_parts.append({"text": p["text"], "start": round(caption_from / SR, 4),
                                  "end": round(caption_to / SR, 4),
                                  "source": p["id"], "language": p["language"]})
            voice_events.append((start_frame * FRAME_SAMPLES + local_from, take))
            pieces_manifest.append({"id": p["id"], "startFrame": start_frame,
                                    "startOffsetSeconds": round(local_from / SR, 5),
                                    "durationSeconds": round(len(take) / SR, 5),
                                    "audibleOnsetSeconds": round(first_active / SR, 5),
                                    "audibleTailSeconds": round(last_active / SR, 5),
                                    "sourceSHA256": sha(RAW / f"{p['id']}.wav")})
            local_cursor = local_to + (INNER_GAP if index + 1 < len(clip["pieces"]) else 0)
        speech_seconds = local_cursor / SR
        end_frame = start_frame + math.ceil((local_cursor + BEAT_GAP) / FRAME_SAMPLES)
        rec = {
            "id": rid, "scene": baseline["scene"], "start": start_frame, "end": end_frame,
            "subtitle": " ".join(p["text"] for p in clip["pieces"]),
            "spoken": " ".join(p["text"] for p in clip["pieces"]),
            "subtitleParts": caption_parts,
            "asrSpeechEnd": round(speech_seconds, 4),
            "sourceDurationSeconds": round(speech_seconds, 4),
            "breathSeconds": round((end_frame - start_frame) / FPS - speech_seconds, 4),
        }
        all_clips.append(rec)
        cursor_frame = end_frame

    scenes = []
    for scene in old["scenes"]:
        if scene["id"] == "references":
            continue
        selected = [c for c in all_clips if c["scene"] == scene["id"]]
        scenes.append({"id": scene["id"], "start": selected[0]["start"],
                       "end": selected[-1]["end"], "title": scene.get("title", scene["id"])})
    coda_start = cursor_frame
    coda_end = coda_start + CODA_FRAMES
    scenes.append({"id": "references", "start": coda_start,
                   "end": coda_end, "title": "证据与论文"})
    result = {"fps": FPS, "duration": coda_end, "seconds": round(coda_end / FPS, 3),
              "version": "v4-short-measured-voice", "scenes": scenes,
              "clips": all_clips, "references": old["references"],
            "voicePolicy": {"source": "public/nobel2026/audio-v4/raw", "noForcedTrim": True,
                              "captionTiming": "one take per phrase; measured acoustic onset and tail"}}
    TIMELINE.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    voice = np.zeros((coda_end * FRAME_SAMPLES, 2), dtype=np.float32)
    last_end = 0
    for start, x in voice_events:
        end = start + len(x)
        if start < last_end or end > len(voice):
            raise RuntimeError(f"audio overlap or overflow at {start}:{end}")
        voice[start:end] = x
        last_end = end
    stem = AUDIO / "voice.wav"
    sf.write(stem, voice, SR, subtype="PCM_24")
    report = {"version": "nobel2026-v4", "timeline": str(TIMELINE.relative_to(ROOT)),
              "voice": str(stem.relative_to(ROOT)), "voiceSHA256": sha(stem),
              "durationFrames": coda_end, "captionParts": sum(len(c["subtitleParts"]) for c in all_clips),
              "maxCaptionCharacters": max(len(p["text"]) for c in all_clips for p in c["subtitleParts"]),
              "captionOverlapCount": sum(c["subtitleParts"][i]["end"] > c["subtitleParts"][i+1]["start"]
                                         for c in all_clips for i in range(len(c["subtitleParts"])-1)),
              "subjectiveListeningChecked": False,
              "takes": pieces_manifest, "tailChecks": tails,
              "potentialTailCuts": [t for t in tails if t["potentialCut"]]}
    (ROOT / "research/nobel2026/v4/assembly.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"V4 timeline {coda_end} frames / {coda_end/FPS:.2f} s; "
          f"{len(all_clips)} beats, {len(pieces_manifest)} clauses; "
          f"tail flags={len(report['potentialTailCuts'])}")


if __name__ == "__main__":
    main()
