"""Build the Nobel Physics V03 audio with rainbow鱼's local Qwen3 voice.

V02 remains untouched.  This script keeps the measured V02 picture clock,
fits each new take only within a small natural tempo window, cleans the take
with the shared broadcast profile, and mixes the user-selected Sappheiros
"Embrace" bed with smooth speech ducking.  The source recording, clone
reference, and music attribution are recorded in the V03 manifest; none are
copied into the delivery bundle.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
TTS_ROOT = Path("D:/python_project/tts")
TTS_PY = TTS_ROOT / ".venv/Scripts/python.exe"
TIMELINE = ROOT / "src/physics2026/timeline-v02.json"
OUT = ROOT / "audio/v03"
RAW = OUT / "raw"
CLEAN = OUT / "clean"
PUBLIC = ROOT / "public/audio-v03"
SOURCE_MUSIC = ROOT.parent / "ai_evolution_ch04_space_time/research/music/v09/sources/Sappheiros-Embrace.m4a"
MUSIC_RECORD = ROOT.parent / "ai_evolution_ch04_space_time/research/music/v09/sources.json"
REF = TTS_ROOT / "work/clone-reference.wav"
REF_META = TTS_ROOT / "work/clone-reference.json"
PAUSE = 0.55


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, check=True, text=True, encoding="utf-8", capture_output=capture)


def spoken_text(text: str) -> str:
    # These are spoken-only choices. Captions keep the canonical scientific
    # spelling from timeline-v02.json.
    return (text.replace("rainbow鱼", "rainbow 鱼")
            .replace("IceCube", "Ice Cube")
            .replace("TXS 0506+056", "TXS 0506+056"))


def generate_raw(rows: list[dict], *, limit: int | None = None) -> dict[str, dict]:
    import torch
    from qwen_tts import Qwen3TTSModel

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    torch.set_num_threads(4)
    reference = json.loads(REF_META.read_text(encoding="utf-8"))
    ref_hash = sha(REF)
    ledger_path = OUT / "tts-generation-v03.json"
    ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {}
    model = Qwen3TTSModel.from_pretrained(str(TTS_ROOT / "models/Qwen3-TTS-0.6B"), device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
    prompt = model.create_voice_clone_prompt(ref_audio=str(REF), ref_text=reference["text"])
    params = {"temperature": 0.42, "top_p": 0.85, "repetition_penalty": 1.05, "max_new_tokens": 1536, "non_streaming_mode": True}
    todo = []
    for row in rows:
        rid = str(row["id"])
        text = spoken_text(str(row["spoken"]))
        seed = 20261006 + int(rid)
        spec = {"text": text, "referenceSha256": ref_hash, "model": str(TTS_ROOT / "models/Qwen3-TTS-0.6B"), "seed": seed, "parameters": params}
        request_hash = hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        target = RAW / f"{rid}.wav"
        if ledger.get(rid, {}).get("requestHash") == request_hash and target.exists():
            continue
        todo.append((row, text, spec, request_hash, target))
    if limit is not None:
        todo = todo[:limit]
    print(f"Qwen user-TTS clips to generate: {len(todo)}", flush=True)
    for row, text, spec, request_hash, target in todo:
        torch.manual_seed(spec["seed"])
        started = time.time()
        waves, sr = model.generate_voice_clone(text=[text], language=["Auto"], voice_clone_prompt=prompt, **params)
        wave = np.asarray(waves[0]).squeeze()
        if wave.ndim != 1 or not np.isfinite(wave).all() or len(wave) < sr * 0.2:
            raise RuntimeError(f"invalid generated take: {row['id']}")
        target.parent.mkdir(parents=True, exist_ok=True)
        sf.write(target, wave, sr, subtype="PCM_24")
        ledger[str(row["id"])] = {**spec, "requestHash": request_hash, "file": target.relative_to(ROOT).as_posix(), "seconds": len(wave) / sr, "sampleRate": sr, "sha256": sha(target), "elapsedSeconds": time.time() - started}
        ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")
        print(row["id"], f"{len(wave)/sr:.2f}s", flush=True)
    return ledger


def clean_and_fit(rows: list[dict]) -> list[dict]:
    """Clean takes, then fit to the already-rendered V02 speech clock."""
    import sys
    sys.path.insert(0, str(TTS_ROOT))
    from broadcast_voice import master_voice

    manifest = []
    for row in rows:
        rid = str(row["id"])
        raw = RAW / f"{rid}.wav"
        if not raw.exists():
            raise FileNotFoundError(raw)
        cleaned = CLEAN / f"{rid}-clean.wav"
        report = CLEAN / f"{rid}-broadcast.json"
        master_voice(raw, cleaned, report)
        duration = float(row["audioSeconds"])
        actual = sf.info(cleaned).duration
        tempo = actual / duration
        # Qwen's cloned voice naturally reads more compactly than the old
        # Edge take. Keep the locked V02 picture/subtitle clock and apply only
        # a bounded, pitch-preserving atempo correction so no visual seam or
        # caption timing has to move. The measured ratios are recorded below.
        if not 0.75 <= tempo <= 1.10:
            raise RuntimeError(f"{rid}: Qwen take differs by {tempo:.3f} from locked picture clock; regenerate or revise this sentence")
        fitted = CLEAN / f"{rid}.wav"
        filters = f"atempo={tempo:.6f},apad,atrim=duration={duration:.6f},afade=t=in:d=0.012,afade=t=out:st={max(0.02, duration-0.05):.6f}:d=0.04"
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(cleaned), "-af", filters, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(fitted)])
        manifest.append({"id": rid, "display": row["spoken"], "spoken": spoken_text(str(row["spoken"])), "raw": raw.relative_to(ROOT).as_posix(), "cleaned": cleaned.relative_to(ROOT).as_posix(), "fitted": fitted.relative_to(ROOT).as_posix(), "rawSeconds": actual, "targetSeconds": duration, "atempo": tempo, "sha256": sha(fitted)})
    (OUT / "voice-manifest-v03.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def assemble_narration(rows: list[dict]) -> tuple[Path, float]:
    silence = OUT / "silence.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", str(PAUSE), "-c:a", "pcm_s24le", str(silence)])
    concat = OUT / "concat.txt"
    files = []
    for row in rows:
        files.extend([CLEAN / f"{row['id']}.wav", silence])
    concat.write_text("\n".join(f"file '{p.as_posix()}'" for p in files) + "\n", encoding="utf-8")
    narration = OUT / "narration.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(narration)])
    seconds = sum(float(r["audioSeconds"]) + PAUSE for r in rows)
    return narration, seconds


def make_music(seconds: float) -> Path:
    if not SOURCE_MUSIC.exists():
        raise FileNotFoundError(SOURCE_MUSIC)
    source_pcm = OUT / "music-source-48k.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(SOURCE_MUSIC), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(source_pcm)])
    wave, sr = sf.read(source_pcm, dtype="float32", always_2d=True)
    total = round(seconds * sr)
    if len(wave) >= total:
        out = wave[:total]
    else:
        need = total - len(wave)
        overlap = min(round(8 * sr), len(wave) // 3, need)
        extra = np.resize(wave, (need + overlap, 2))
        blend = np.linspace(0, 1, overlap, dtype=np.float32)[:, None]
        joined = wave[-overlap:] * (1 - blend) + extra[:overlap] * blend
        out = np.concatenate([wave[:-overlap], joined, extra[overlap:need + overlap]], axis=0)
    looped = OUT / "music-looped.wav"
    sf.write(looped, out, sr, subtype="PCM_24")
    music = OUT / "music.wav"
    # Remove low rumble and carve a small speech presence pocket; the music
    # remains audible and retains the source's original speed and pitch.
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(looped), "-af", "highpass=f=65,equalizer=f=2700:t=o:w=1.6:g=-2.5,lowpass=f=15000,afade=t=in:d=2.4,afade=t=out:st=" + str(max(0.0, seconds - 6.5)) + ":d=6.5", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(music)])
    return music


def mix(narration: Path, music: Path, seconds: float) -> Path:
    premaster = OUT / "premaster.wav"
    graph = ("[1:a]volume=0.30[m0];"
             "[m0][0:a]sidechaincompress=threshold=0.025:ratio=7:attack=25:release=520:makeup=1:link=average[mduck];"
             "[0:a]volume=1.0[v];[v][mduck]amix=inputs=2:duration=first:dropout_transition=2,aresample=48000[a]")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(narration), "-i", str(music), "-filter_complex", graph, "-map", "[a]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(premaster)])
    master = OUT / "master.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(premaster), "-af", "loudnorm=I=-14.5:TP=-1.8:LRA=8", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(master)])
    PUBLIC.mkdir(parents=True, exist_ok=True)
    shutil.copy2(master, PUBLIC / "master.wav")
    shutil.copy2(narration, PUBLIC / "narration.wav")
    shutil.copy2(music, PUBLIC / "music.wav")
    return master


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    CLEAN.mkdir(parents=True, exist_ok=True)
    rows = json.loads(TIMELINE.read_text(encoding="utf-8"))["clips"]
    if args.generate:
        generate_raw(rows, limit=args.limit)
    # A second invocation without --generate resumes from the cached raw WAVs.
    for row in rows:
        if not (RAW / f"{row['id']}.wav").exists():
            raise FileNotFoundError(f"missing raw take {row['id']}; run with --generate")
    clean_and_fit(rows)
    narration, seconds = assemble_narration(rows)
    music = make_music(seconds)
    master = mix(narration, music, seconds)
    music_record = json.loads(MUSIC_RECORD.read_text(encoding="utf-8"))
    selected = next(c for c in music_record["candidates"] if c["title"] == "Embrace")
    manifest = {"version": "nobel-physics-2026-v03-audio", "timeline": "src/physics2026/timeline-v02.json", "durationSeconds": seconds, "sampleRate": 48000, "referenceVoice": {"model": "Qwen3-TTS-0.6B", "referenceFile": "D:/python_project/tts/work/clone-reference.wav", "referenceSha256": sha(REF), "profile": "broadcast_voice.py rainbow-narration-v2", "parameters": {"temperature": 0.42, "topP": 0.85, "repetitionPenalty": 1.05, "maxNewTokens": 1536}}, "music": {"title": selected["title"], "author": selected["author"], "source": selected["source"], "sourceSha256": selected["sourceSHA256"], "attribution": selected["attribution"], "mix": "original speed/pitch, 8 s loop crossfade, highpass 65 Hz, 2.7 kHz speech carve, smooth sidechain ducking"}, "narration": str(narration.relative_to(ROOT)), "musicFile": str(music.relative_to(ROOT)), "premaster": str((OUT / 'premaster.wav').relative_to(ROOT)), "master": str(master.relative_to(ROOT)), "masterSha256": sha(master), "voiceClips": json.loads((OUT / 'voice-manifest-v03.json').read_text(encoding='utf-8'))}
    (OUT / "audio-manifest-v03.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"seconds": seconds, "master": str(master), "sha256": sha(master)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
