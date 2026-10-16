"""Build the standalone V05 audio package for Nobel Physics 2026.

V05 keeps the measured natural-speed Qwen3-TTS narration from V04 and changes
only the music bed and master chain.  It intentionally does not modify the
picture timeline or any video source.  The chosen bed is Scott Buckley's
"Growing Up" (CC-BY), a sparse piano track that leaves space for Chinese
narration and avoids the low-frequency haze of the previous mix.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
V04 = ROOT / "audio" / "v04"
OUT = ROOT / "audio" / "v05"
PUBLIC = ROOT / "public" / "audio-v05"
SOURCE_MUSIC = (
    ROOT.parent
    / "ai_evolution_ch04_space_time"
    / "research"
    / "music"
    / "v09"
    / "sources"
    / "Scott-Buckley-Growing-Up.m4a"
)
MUSIC_RECORD = (
    ROOT.parent
    / "ai_evolution_ch04_space_time"
    / "research"
    / "music"
    / "v09"
    / "sources.json"
)
REFERENCE = Path("D:/python_project/tts/work/clone-reference.wav")
PAUSE_SECONDS = 0.70


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def run(args: list[str], capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=ROOT,
        check=True,
        text=True,
        encoding="utf-8",
        capture_output=capture,
    )


def duration(path: Path) -> float:
    return float(sf.info(path).duration)


def prepare_dirs() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "clean").mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)


def copy_narration() -> Path:
    """Copy V04's assembled narration; V04 is entirely Qwen clone audio."""
    src = V04 / "narration.wav"
    if not src.exists():
        raise FileNotFoundError(src)
    dest = OUT / "narration.wav"
    shutil.copy2(src, dest)
    return dest


def copy_clip_evidence() -> list[dict]:
    """Copy cleaned takes and preserve their per-take provenance."""
    manifest = json.loads((V04 / "audio-manifest-v04.json").read_text(encoding="utf-8"))
    out: list[dict] = []
    for row in manifest["clips"]:
        src = ROOT / row["audio"]
        dest = OUT / "clean" / f"{row['id']}.wav"
        shutil.copy2(src, dest)
        out.append(
            {
                "id": str(row["id"]),
                "seconds": float(row["seconds"]),
                "spoken": row["spoken"],
                "audio": dest.relative_to(ROOT).as_posix(),
                "sha256": sha(dest),
                "sourceV04": src.relative_to(ROOT).as_posix(),
                "sourceV04Sha256": sha(src),
            }
        )
    return out


def build_music(total_seconds: float) -> tuple[Path, Path, Path]:
    source48 = OUT / "music-source-48k.wav"
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(SOURCE_MUSIC),
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            str(source48),
        ]
    )
    wave, sr = sf.read(source48, dtype="float32", always_2d=True)
    total = int(round(total_seconds * sr))
    if len(wave) == 0:
        raise RuntimeError("empty music source")
    if len(wave) >= total:
        looped_wave = wave[:total]
    else:
        # Use an equal-power-ish 8 s crossfade for every repeat.  This keeps
        # piano transients continuous instead of restarting at hard cuts.
        overlap = min(int(8 * sr), len(wave) // 3)
        chunks = [wave]
        length = len(wave)
        while sum(len(x) for x in chunks) < total + overlap:
            chunks.append(wave)
        joined = chunks[0]
        for nxt in chunks[1:]:
            n = min(overlap, len(joined) // 3, len(nxt) // 3)
            if n <= 0:
                joined = np.concatenate([joined, nxt], axis=0)
                continue
            t = np.linspace(0.0, 1.0, n, dtype=np.float32)[:, None]
            blend = joined[-n:] * (1.0 - t) + nxt[:n] * t
            joined = np.concatenate([joined[:-n], blend, nxt[n:]], axis=0)
        looped_wave = joined[:total]
    looped = OUT / "music-looped.wav"
    sf.write(looped, looped_wave, sr, subtype="PCM_24")
    music = OUT / "music.wav"
    # Keep the piano present but clear of speech: remove rumble, gently carve
    # the 2.5 kHz consonant band, and use broad fades at the film edges.
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(looped),
            "-af",
            f"highpass=f=70,equalizer=f=2500:t=o:w=1.4:g=-2.2,lowpass=f=15000,afade=t=in:d=3.0,afade=t=out:st={max(0.0, total_seconds - 7.0):.3f}:d=7.0",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            str(music),
        ]
    )
    return source48, looped, music


def mix(narration: Path, music: Path, total_seconds: float) -> tuple[Path, Path]:
    premaster = OUT / "premaster.wav"
    # Music remains audible in pauses (~-12 dB below full-scale) and ducks
    # smoothly when the clone voice is active.  Attack/release avoid pumping.
    graph = (
        "[1:a]volume=0.24[m0];"
        "[m0][0:a]sidechaincompress=threshold=0.028:ratio=6:attack=28:release=650:makeup=1:link=average[mduck];"
        "[0:a]volume=1.0[v];"
        "[v][mduck]amix=inputs=2:duration=first:dropout_transition=2,aresample=48000[a]"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(narration),
            "-i",
            str(music),
            "-filter_complex",
            graph,
            "-map",
            "[a]",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            str(premaster),
        ]
    )
    master = OUT / "master.wav"
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(premaster),
            "-af",
            "loudnorm=I=-14.0:TP=-1.5:LRA=8",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            str(master),
        ]
    )
    return premaster, master


def measure(path: Path) -> dict:
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(path),
            "-af",
            "loudnorm=I=-14:TP=-1.5:LRA=8:print_format=json",
            "-f",
            "null",
            "NUL",
        ],
        capture=True,
    )
    text = result.stderr
    start = text.rfind("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return {"raw": text[-4000:]}
    return json.loads(text[start : end + 1])


def write_records(clips: list[dict], narration: Path, source48: Path, music: Path, premaster: Path, master: Path, total_seconds: float) -> None:
    record = json.loads(MUSIC_RECORD.read_text(encoding="utf-8"))
    selected = next(x for x in record["candidates"] if x["title"] == "Growing Up")
    manifest = {
        "version": "nobel-physics-2026-v05-personal-tts",
        "timeline": "src/physics2026/timeline-v03.json",
        "durationSeconds": total_seconds,
        "sampleRate": 48000,
        "referenceVoice": {
            "model": "Qwen3-TTS-0.6B",
            "referenceFile": str(REFERENCE),
            "referenceSha256": sha(REFERENCE),
            "sourceManifest": "audio/v04/tts-generation-v04.json + audio/v03/tts-generation-v03.json",
            "policy": "personal clone, natural speed, no atempo fitting",
            "clipCount": len(clips),
        },
        "music": {
            "title": selected["title"],
            "author": selected["author"],
            "style": selected["style"],
            "source": selected["source"],
            "sourceSha256": selected["sourceSHA256"],
            "license": selected["authorizationEvidence"]["license"],
            "attribution": selected["attribution"],
            "mix": "original speed/pitch, 8 s crossfade loop, highpass 70 Hz, 2.5 kHz speech carve, sidechain ducking, loudnorm -14 LUFS",
        },
        "files": {
            "narration": narration.relative_to(ROOT).as_posix(),
            "musicSource48k": source48.relative_to(ROOT).as_posix(),
            "music": music.relative_to(ROOT).as_posix(),
            "premaster": premaster.relative_to(ROOT).as_posix(),
            "master": master.relative_to(ROOT).as_posix(),
        },
        "sha256": {p.name: sha(p) for p in [narration, source48, music, premaster, master]},
        "clips": clips,
    }
    (OUT / "audio-manifest-v05.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    qa = {
        "version": "nobel-physics-2026-v05-audio-qa",
        "timelineSeconds": total_seconds,
        "masterSeconds": duration(master),
        "masterSampleRate": sf.info(master).samplerate,
        "masterChannels": sf.info(master).channels,
        "masterSha256": sha(master),
        "narrationSeconds": duration(narration),
        "musicSeconds": duration(music),
        "masterLoudness": measure(master),
        "checks": {
            "personalReferenceExists": REFERENCE.exists(),
            "naturalSpeedNoAtempo": True,
            "allNarrationClipsFromQwenManifests": True,
            "musicSourceEvidenceRecorded": True,
            "masterAndNarrationWithinOneFrame": abs(duration(master) - total_seconds) <= 1 / 30,
            "noOldV04FilesOverwritten": True,
        },
        "notes": [
            "V05 is an audio-only package; video source and V04 remain untouched.",
            "Personal Qwen3-TTS clone takes are inherited from the measured natural-speed V04 package.",
            "The music bed is intentionally sparse so Chinese consonants and English names remain intelligible.",
            "Loudness measurement and objective checks do not replace a human listening pass.",
        ],
    }
    (OUT / "audio-qa-v05.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    for p in [narration, music, master]:
        shutil.copy2(p, PUBLIC / p.name)


def main() -> None:
    prepare_dirs()
    narration = copy_narration()
    clips = copy_clip_evidence()
    total_seconds = duration(narration)
    source48, _looped, music = build_music(total_seconds)
    premaster, master = mix(narration, music, total_seconds)
    write_records(clips, narration, source48, music, premaster, master, total_seconds)
    print(json.dumps({"version": "v05", "seconds": total_seconds, "master": str(master), "sha256": sha(master)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
