"""Sparse, voice-first score for the natural metro narration revision.

The first metro score used several layers of mallets, bass and brushed ticks.
This revision keeps two restrained felt-piano layers and one soft root tone.
The sparse arrangement leaves the consonants and pauses of the narration open.
By default it writes the canonical ``public/metro`` assets; pass ``--out-dir``
and ``--research-dir`` when rendering an isolated comparison.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

R = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description="Build the sparse metro score and mix")
parser.add_argument(
    "--out-dir", default="public/metro",
    help="asset directory containing narration.wav/timeline.json and receiving the mix (default: canonical public/metro)",
)
parser.add_argument(
    "--research-dir", default="research/metro",
    help="directory receiving the audio manifest (default: canonical research/metro)",
)
args = parser.parse_args()
P = (R / args.out_dir).resolve()
Q = (R / args.research_dir).resolve()
P.mkdir(parents=True, exist_ok=True)
Q.mkdir(parents=True, exist_ok=True)
sr = 48000
voice, voice_sr = sf.read(P / "narration.wav", dtype="float32", always_2d=True)
assert voice_sr == sr and voice.ndim == 2 and voice.shape[1] == 2
N = len(voice)
duration = N / sr
fps = 30
timeline = json.loads((P / "timeline.json").read_text(encoding="utf-8"))

def hz(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)

music = np.zeros((N, 2), dtype=np.float32)

def add(wave, at, gain=1.0, pan=0.5):
    start = int(round(at * sr))
    if start >= N or start + len(wave) <= 0:
        return
    left = max(0, -start)
    start = max(0, start)
    end = min(N, start + len(wave) - left)
    if end <= start:
        return
    l = gain * np.sqrt(max(0.0, 1.0 - pan))
    r = gain * np.sqrt(max(0.0, pan))
    music[start:end, 0] += wave[left:left + end - start] * l
    music[start:end, 1] += wave[left:left + end - start] * r

def piano(midi, seconds=3.2, level=0.06):
    t = np.arange(int(seconds * sr), dtype=np.float32) / sr
    f = hz(midi)
    attack = 1.0 - np.exp(-t / 0.012)
    env = attack * np.exp(-t / 1.75)
    # Felt-like fundamental with very low upper partials; no bright arpeggio.
    y = np.sin(2 * np.pi * f * t)
    y += 0.16 * np.sin(2 * np.pi * 2.003 * f * t) * np.exp(-t / 0.65)
    y += 0.045 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / 0.2)
    return (y * env * level).astype(np.float32)

def root_tone(midi, seconds=3.8, level=0.022):
    t = np.arange(int(seconds * sr), dtype=np.float32) / sr
    f = hz(midi)
    env = (1.0 - np.exp(-t / 0.020)) * np.exp(-t / 2.4)
    y = np.sin(2 * np.pi * f * t)
    y += 0.08 * np.sin(2 * np.pi * 2.0 * f * t) * np.exp(-t / 0.8)
    return (y * env * level).astype(np.float32)

# The four-chord route is deliberately slow: one chord per eight seconds.
# The long root notes give the film a floor while leaving the voice in front.
chords = [(38, [57, 61, 64]), (35, [57, 62, 66]),
          (31, [54, 59, 62]), (33, [55, 59, 64])]
bar = 8.0
bars = int(np.ceil(duration / bar))
for i in range(bars):
    t0 = i * bar
    if t0 >= duration - 6.0:
        break
    root, notes = chords[i % len(chords)]
    # Two quiet piano layers: a low felt chord and a sparse upper answer.
    for j, note in enumerate(notes):
        add(piano(note, seconds=5.4, level=0.037), t0 + 0.08 + j * 0.018,
            gain=0.82, pan=0.36 + 0.14 * j)
    if i % 4 != 3:
        for j, note in enumerate(notes[:2]):
            add(piano(note + 12, seconds=2.8, level=0.022), t0 + 4.35 + j * 0.018,
                gain=0.46, pan=0.45 + 0.10 * j)
    # One low root at the start of each phrase gives the scene a quiet floor.
    if i < bars - 2:
        add(root_tone(root), t0 + 0.04, gain=0.46, pan=0.50)

# Very short room reflections, barely audible and mono-compatible.
for delay, gain in [(0.083, 0.035), (0.137, 0.022)]:
    d = int(round(delay * sr))
    music[d:] += music[:-d, ::-1] * gain
music = sosfilt(butter(2, 7600, fs=sr, btype="lowpass", output="sos"), music, axis=0)

# Voice-first ducking: a 0.16 s attack, 1.15 s release and deeper reduction.
block = 480
env = np.zeros(int(np.ceil(N / block)), dtype=np.float32)
for clip in timeline.get("clips", []):
    a = max(0, int((clip["start"] / fps - 0.16) * sr / block))
    b = min(len(env), int((clip["end"] / fps + 0.24) * sr / block))
    env[a:b] = 1.0
duck = np.zeros_like(env)
level = 0.0
for i, wanted in enumerate(env):
    coeff = 0.30 if wanted > level else 0.012
    level += coeff * (wanted - level)
    duck[i] = level
active = np.max(np.abs(voice), axis=1) > 0.012
vr = float(np.sqrt(np.mean(voice[active] ** 2)))
mr = float(np.sqrt(np.mean(music[active] ** 2)))
# Keep a declared target separate from the measured result. The actual
# post-ducking separation is measured below and written to the manifest.
target_separation_db = 22.5
music *= vr / (max(mr, 1e-9) * 10 ** (target_separation_db / 20.0))
music *= np.repeat(1.0 - 0.30 * duck, block)[:N, None]

seconds = np.arange(N, dtype=np.float32) / sr
coda = next((s["start"] for s in timeline.get("scenes", []) if s["id"] == "references"), N / fps) / fps
music *= (1.0 + 0.30 * np.clip((seconds - coda) / 1.5, 0.0, 1.0))[:, None]
fade = np.clip(seconds / 1.4, 0.0, 1.0) * np.clip((duration - seconds) / 3.5, 0.0, 1.0)
music *= fade[:, None]
premaster = voice + music
sf.write(P / "music.wav", music, sr, subtype="PCM_24")
sf.write(P / "premaster.wav", premaster, sr, subtype="PCM_24")

def loudness(path):
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path), "-af",
         "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=True)
    tail = proc.stderr[proc.stderr.rfind("{"):]
    return json.JSONDecoder().raw_decode(tail)[0]

measurement = loudness(P / "premaster.wav")
flt = "loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:" + ":".join(
    f"{key}={measurement[value]}" for key, value in [
        ("measured_I", "input_i"), ("measured_TP", "input_tp"),
        ("measured_LRA", "input_lra"), ("measured_thresh", "input_thresh"),
        ("offset", "target_offset")])
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(P / "premaster.wav"),
                "-af", flt, "-ar", str(sr), "-c:a", "pcm_s24le",
                str(P / "master.wav")], check=True)
master, master_sr = sf.read(P / "master.wav", dtype="float32", always_2d=True)
assert master_sr == sr and len(master) == N and np.isfinite(master).all()
final_measurement = loudness(P / "master.wav")
(P / "previews").mkdir(exist_ok=True)
sf.write(P / "previews/music-sparse.wav", music[round(10 * sr):round(34 * sr)] * 3,
         sr, subtype="PCM_16")
sf.write(P / "previews/mix-opening.wav", master[:round(30 * sr)], sr, subtype="PCM_16")

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
music_active_rms = float(np.sqrt(np.mean(music[active] ** 2)))
actual_separation_db = float(20 * np.log10(max(vr, 1e-12) / max(music_active_rms, 1e-12)))
voice_rms_db = float(20 * np.log10(max(vr, 1e-12)))
music_rms_db = float(20 * np.log10(max(music_active_rms, 1e-12)))
manifest = {
    "title": "下一站·留白（疏朗版）",
    "composer": "rainbow鱼 original procedural composition",
    "source": "scripts/score_metro_v2.py; deterministic synthesis",
    "license": "Original synthesized score; no third-party samples",
    "tempoBpm": 75,
    "instrumentation": ["felt piano low layer", "felt piano upper layer", "soft root tone"],
    "arrangement": "One slow chord per eight seconds; two restrained piano layers plus one low root; no plucks, pulses or continuous percussion",
    "musicReused": False,
    "durationSeconds": duration,
    "targetLufs": -16,
    "targetTruePeak": -1.5,
    "premasterMeasurement": measurement,
    "masterMeasurement": final_measurement,
    "voiceToMusicTargetRmsSeparationDb": target_separation_db,
    "voiceToMusicActiveRmsSeparationDb": actual_separation_db,
    "voiceToMusicActiveRmsMeasurement": {
        "voiceRmsDb": voice_rms_db,
        "musicRmsDb": music_rms_db,
        "afterDucking": True,
        "activeMask": "narration samples with peak > 0.012",
    },
    "files": {name: {"sha256": sha(P / name), "bytes": (P / name).stat().st_size}
              for name in ["narration.wav", "music.wav", "master.wav"]},
    "subjectiveListeningChecked": False,
    "aacMeasurementPending": True,
}
(Q / "audio-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(manifest, ensure_ascii=False, indent=2))
