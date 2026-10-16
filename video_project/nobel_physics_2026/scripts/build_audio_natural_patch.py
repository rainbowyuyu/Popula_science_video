"""Build a reversible narration audition from the natural-voice patch.

The current V03 audio is never overwritten.  This script renders only the nine
candidate clips in ``docs/narration-v02-natural-patch.json`` with the local
Qwen3 voice, fits them to the existing picture clock, then assembles a full
audition using the unchanged V03 music bed.  It is deliberately separate from
``build_audio_v03_user_tts.py`` so a story experiment cannot mutate delivery
assets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
TTS_ROOT = Path("D:/python_project/tts")
TTS_PY = TTS_ROOT / ".venv/Scripts/python.exe"
PATCH = ROOT / "docs/narration-v02-natural-patch.json"
TIMELINE = ROOT / "src/physics2026/timeline-v02.json"
V03_AUDIO = ROOT / "audio/v03"
OUT = ROOT / "audio/candidate-natural"
RAW = OUT / "raw"
CLEAN = OUT / "clean"
REF = TTS_ROOT / "work/clone-reference.wav"
REF_META = TTS_ROOT / "work/clone-reference.json"
PAUSE = 0.55


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args: list[str]) -> None:
    subprocess.run(args, cwd=ROOT, check=True, text=True, encoding="utf-8")


def voice_text(text: str) -> str:
    return text.replace("rainbow鱼", "rainbow 鱼").replace("IceCube", "Ice Cube")


def load_rows() -> tuple[list[dict], dict[str, dict]]:
    timeline = json.loads(TIMELINE.read_text(encoding="utf-8"))
    patch = json.loads(PATCH.read_text(encoding="utf-8"))
    base = {str(row["id"]): row for row in timeline["clips"]}
    candidates = {str(row["id"]): row for row in patch["clips"]}
    for rid, row in candidates.items():
        if rid not in base:
            raise KeyError(f"candidate clip {rid} is not in the locked timeline")
        if abs(float(row["targetSeconds"]) - float(base[rid]["audioSeconds"])) > 1e-3:
            raise ValueError(f"{rid}: patch targetSeconds changed the picture clock")
    return sorted(base.values(), key=lambda row: int(str(row["id"]))), candidates


def generate_candidates(candidates: dict[str, dict], limit: int | None = None) -> None:
    import torch
    from qwen_tts import Qwen3TTSModel

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    torch.set_num_threads(4)
    reference = json.loads(REF_META.read_text(encoding="utf-8"))
    prompt = Qwen3TTSModel.from_pretrained
    model = prompt(str(TTS_ROOT / "models/Qwen3-TTS-0.6B"), device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
    clone_prompt = model.create_voice_clone_prompt(ref_audio=str(REF), ref_text=reference["text"])
    params = {"temperature": 0.42, "top_p": 0.85, "repetition_penalty": 1.05, "max_new_tokens": 1536, "non_streaming_mode": True}
    ids = sorted(candidates, key=lambda x: int(x))
    if limit is not None:
        ids = ids[:limit]
    for rid in ids:
        out = RAW / f"{rid}.wav"
        if out.exists():
            print(f"reuse {rid}: {out}", flush=True)
            continue
        row = candidates[rid]
        seed = 20261006 + int(rid) + 1000
        torch.manual_seed(seed)
        text = voice_text(str(row["spoken"]))
        waves, sr = model.generate_voice_clone(text=[text], language=["Auto"], voice_clone_prompt=clone_prompt, **params)
        wave = np.asarray(waves[0]).squeeze()
        if wave.ndim != 1 or not np.isfinite(wave).all() or len(wave) < sr * 0.2:
            raise RuntimeError(f"invalid Qwen take for {rid}")
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(out, wave, sr, subtype="PCM_24")
        print(f"generated {rid}: {len(wave) / sr:.2f}s", flush=True)


def fit_candidates(rows: list[dict], candidates: dict[str, dict]) -> list[dict]:
    sys.path.insert(0, str(TTS_ROOT))
    from broadcast_voice import master_voice

    out_manifest: list[dict] = []
    for row in rows:
        rid = str(row["id"])
        target = float(row["audioSeconds"])
        src = RAW / f"{rid}.wav" if rid in candidates else V03_AUDIO / "clean" / f"{rid}.wav"
        if not src.exists():
            raise FileNotFoundError(src)
        if rid in candidates:
            clean = CLEAN / f"{rid}-clean.wav"
            report = CLEAN / f"{rid}-broadcast.json"
            master_voice(src, clean, report)
            src_clean = clean
        else:
            src_clean = src
        actual = sf.info(src_clean).duration
        tempo = actual / target
        if not 0.75 <= tempo <= 1.10:
            raise RuntimeError(f"{rid}: candidate take needs tempo {tempo:.3f}, outside 0.75–1.10")
        fitted = CLEAN / f"{rid}.wav"
        filters = f"atempo={tempo:.6f},apad,atrim=duration={target:.6f},afade=t=in:d=0.012,afade=t=out:st={max(0.02, target - 0.05):.6f}:d=0.04"
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src_clean), "-af", filters, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(fitted)])
        out_manifest.append({"id": rid, "source": "candidate" if rid in candidates else "v03", "spoken": voice_text(row.get("spoken", row["spoken"])), "targetSeconds": target, "measuredSeconds": actual, "atempo": tempo, "fitted": fitted.relative_to(ROOT).as_posix(), "sha256": sha(fitted)})
    (OUT / "voice-manifest-natural-candidate.json").write_text(json.dumps(out_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_manifest


def assemble(rows: list[dict]) -> tuple[Path, float]:
    silence = OUT / "silence.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", str(PAUSE), "-c:a", "pcm_s24le", str(silence)])
    concat = OUT / "concat.txt"
    files = []
    for row in rows:
        files.extend([CLEAN / f"{row['id']}.wav", silence])
    concat.write_text("\n".join(f"file '{p.as_posix()}'" for p in files) + "\n", encoding="utf-8")
    narration = OUT / "narration.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(narration)])
    return narration, sum(float(row["audioSeconds"]) + PAUSE for row in rows)


def mix(narration: Path, seconds: float) -> Path:
    music = V03_AUDIO / "music.wav"
    premaster = OUT / "premaster.wav"
    graph = ("[1:a]volume=0.30[m0];"
             "[m0][0:a]sidechaincompress=threshold=0.025:ratio=7:attack=25:release=520:makeup=1:link=average[mduck];"
             "[0:a]volume=1.0[v];[v][mduck]amix=inputs=2:duration=first:dropout_transition=2,aresample=48000[a]")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(narration), "-i", str(music), "-filter_complex", graph, "-map", "[a]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(premaster)])
    master = OUT / "master.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(premaster), "-af", "loudnorm=I=-14.5:TP=-1.8:LRA=8", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(master)])
    manifest = {"version": "nobel-physics-2026-natural-story-audition", "baseAudio": "audio/v03/master.wav", "durationSeconds": seconds, "music": "reused audio/v03/music.wav", "voiceManifest": "audio/candidate-natural/voice-manifest-natural-candidate.json", "master": str(master.relative_to(ROOT)), "masterSha256": sha(master)}
    (OUT / "audio-manifest-natural-candidate.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return master


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    CLEAN.mkdir(parents=True, exist_ok=True)
    rows, candidates = load_rows()
    if args.generate:
        generate_candidates(candidates, args.limit)
    for rid in candidates:
        if not (RAW / f"{rid}.wav").exists():
            raise FileNotFoundError(f"missing candidate raw take {rid}; run with --generate")
    fit_candidates(rows, candidates)
    narration, seconds = assemble(rows)
    master = mix(narration, seconds)
    print(json.dumps({"seconds": seconds, "master": str(master), "sha256": sha(master)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
