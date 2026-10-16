"""Generate an alternate 5-minute score for DNA Storage V4.

This is an original, deterministic arrangement built from the project's CC0
sample bank.  It keeps enough space for rainbow鱼 narration while adding a
clearer cinematic arc than the first score: sparse question, forward motion
through encoding, a denser Fountain section, an airy lab middle, then a warm
return.  No previous melody/progression is reused.
"""
from pathlib import Path
import hashlib, json
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt
from acoustic_bank import AcousticBank

V3 = Path(__file__).resolve().parents[1]
SR = 48_000
DURATION = 300
SEED = 202610114
BPM = 84
BEAT = 60 / BPM

# B minor / D major gives the data sections a quiet sense of lift.  Each tuple
# is root MIDI note and the chord tones above it.
PROGRESSION = [
    (50, [50, 54, 57, 61]),  # Bm
    (45, [45, 49, 52, 57]),  # A
    (47, [47, 50, 54, 59]),  # Bm/D colour
    (43, [43, 47, 50, 55]),  # G
    (38, [38, 42, 45, 50]),  # D/F# colour
    (45, [45, 49, 52, 57]),  # A
    (40, [40, 43, 47, 52]),  # Em
    (43, [43, 47, 50, 55]),  # G
]

# A small five-note motif.  It is deliberately stepwise so it survives ducking
# under speech and can be heard as one journey across all stations.
MOTIF_ONSETS = [0.0, 0.85, 1.7, 2.55, 3.25]
MOTIF_NOTES = [
    [74, 76, 78, 81, 78],
    [73, 74, 76, 81, 76],
    [74, 76, 78, 81, 78],
    [71, 74, 76, 79, 76],
    [74, 76, 78, 81, 78],
    [73, 74, 76, 81, 76],
    [71, 74, 76, 79, 76],
    [71, 74, 76, 79, 74],
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    out = V3 / "public" / "music"
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    bank = AcousticBank()
    score = np.zeros((DURATION * SR, 2), np.float32)
    fx = np.zeros_like(score)
    events = []

    def note(inst: str, midi: int, start: float, seconds: float, velocity: float, pan: float = 0.0):
        if start < 0 or start >= DURATION:
            return
        x = bank.note(inst, int(midi), max(0.04, seconds), velocity, int(rng.integers(0, 3)))
        x[:, 0] *= np.sqrt((1 - pan) / 2) * 1.4142
        x[:, 1] *= np.sqrt((1 + pan) / 2) * 1.4142
        a = round(start * SR)
        b = min(len(score), a + len(x))
        score[a:b] += x[: b - a]
        events.append({"instrument": inst, "midi": int(midi), "start": round(start, 4),
                       "duration": round(seconds, 4), "velocity": round(velocity, 4)})

    def low_pulse(start: float, root: int, gain: float):
        """A quiet deterministic sine pulse, used as a felt data-flow bed."""
        n = round(0.42 * SR)
        t = np.arange(n, dtype=np.float32) / SR
        y = np.sin(2 * np.pi * (55.0 * 2 ** ((root - 43) / 12) * t))
        y *= np.sin(np.pi * np.clip(t / 0.42, 0, 1)) ** 1.5 * gain
        a = round(start * SR); b = min(len(score), a + n)
        score[a:b, 0] += y[:b - a] * 0.75
        score[a:b, 1] += y[:b - a]

    bars = int(np.ceil(DURATION / (4 * BEAT)))
    for bar in range(bars):
        t = bar * 4 * BEAT
        phase = bar % len(PROGRESSION)
        root, chord = PROGRESSION[phase]
        # Section-specific density and colour.
        if t < 18:
            pad_gain, pulse_gain, motif_gain = 0.34, 0.05, 0.08
        elif t < 75:
            pad_gain, pulse_gain, motif_gain = 0.40, 0.15, 0.18
        elif t < 118:
            pad_gain, pulse_gain, motif_gain = 0.46, 0.28, 0.25
        elif t < 160:
            pad_gain, pulse_gain, motif_gain = 0.28, 0.12, 0.14
        elif t < 216:
            pad_gain, pulse_gain, motif_gain = 0.43, 0.22, 0.22
        elif t < 262:
            pad_gain, pulse_gain, motif_gain = 0.47, 0.25, 0.30
        elif t < 290:
            pad_gain, pulse_gain, motif_gain = 0.38, 0.14, 0.26
        else:
            pad_gain, pulse_gain, motif_gain = 0.22, 0.04, 0.10

        # Long bowed bed; stagger the voices so camera transitions have air.
        note("cello", root, t, 3.72, 0.30 * pad_gain / 0.4, -0.16)
        note("viola", chord[1] + 12, t + 0.08, 3.5, 0.12 * pad_gain / 0.4, 0.22)
        if bar % 2 == 0:
            note("viola", chord[2] + 12, t + 0.23, 3.3, 0.10 * pad_gain / 0.4, 0.30)

        # Broken-piano arpeggio follows the same particle from left to right.
        order = [0, 2, 1, 3]
        for k in range(4):
            onset = k * BEAT
            n = chord[order[k]] + (12 if (bar + k) % 3 == 0 else 0)
            note("piano", n, t + onset, 1.22, pulse_gain * (0.82 if k % 2 else 1.0), -0.18 + 0.12 * k)

        # Harp glints mark constraint passes and decoded relationships.
        if 18 <= t < 160 or 216 <= t < 290:
            for k in (1, 2, 3):
                note("harp", chord[(k + bar) % 4] + 12, t + (k * 0.36), 0.95,
                     0.10 + 0.025 * motif_gain / 0.25, 0.28)

        # Sparse pizzicato gives the Fountain and consensus sections a pulse.
        if 75 <= t < 118 or 160 <= t < 216:
            for k in (0, 2, 3):
                note("pizz", chord[(k + 1) % 4] + 12, t + k * BEAT * 0.92, 0.62,
                     0.12 * (1.0 if k != 2 else 0.78), 0.08 if k % 2 else -0.12)

        # The motif is audible at section edges but never becomes a lead over
        # speech.  It returns in the final minute to make the round trip clear.
        if bar % 2 == 0 or t < 18 or t >= 262:
            for onset, midi in zip(MOTIF_ONSETS, MOTIF_NOTES[phase]):
                if t + onset * BEAT < DURATION:
                    note("piano", midi, t + onset * BEAT, 0.86, motif_gain, -0.04)

        if 75 <= t < 160 or 160 <= t < 262:
            low_pulse(t + 0.02, root, 0.012 + 0.004 * pulse_gain)

    # Very quiet filtered risers at station hand-offs.  They are sound-design
    # accents, not a second melody.
    for at in (17.7, 43.7, 74.7, 117.7, 159.7, 215.7, 261.7, 289.2):
        n = round(1.15 * SR)
        tt = np.arange(n, dtype=np.float32) / SR
        noise = rng.normal(0, 1, n).astype(np.float32)
        noise = sosfilt(butter(2, [320, 2600], fs=SR, btype="bandpass", output="sos"), noise)
        env = np.sin(np.pi * np.clip(tt / 1.15, 0, 1)) ** 2
        tone = np.sin(2 * np.pi * (160 * tt + 96 * tt * tt)) * np.exp(-tt * 2.7)
        y = (noise * 0.006 + tone * 0.0022) * env
        a = round(at * SR); b = min(len(fx), a + n)
        fx[a:b, 0] += y[: b - a] * 0.72
        fx[a:b, 1] += y[: b - a]

    # Fade the complete bed; retain a gentle tail for the 5-second paper coda.
    env = np.ones(len(score), np.float32)
    n = 2 * SR; env[:n] = np.linspace(0, 1, n) ** 0.72
    n = 4 * SR; env[-n:] = np.linspace(1, 0, n) ** 1.35
    score *= env[:, None]; fx *= env[:, None]
    score = sosfilt(butter(2, 6800, fs=SR, output="sos"), score, axis=0).astype(np.float32)

    music_path = out / "dna_archive_glow_v4.wav"
    fx_path = out / "dna_archive_transitions_v4.wav"
    sf.write(music_path, score, SR, subtype="PCM_24")
    sf.write(fx_path, fx, SR, subtype="PCM_24")
    manifest = {
        "title": "DNA Archive Glow / DNA档案微光",
        "version": "v4",
        "originalArrangement": True,
        "sameFilm": "DNA storage V3",
        "sourceSamples": "https://github.com/sgossner/VSCO-2-CE",
        "sampleLicense": "CC0-1.0",
        "sampleManifest": "public/music/samples/manifest.json",
        "seed": SEED, "bpm": BPM, "meter": "4/4", "key": "B minor / D major",
        "seconds": DURATION,
        "instrumentation": ["upright piano", "harp", "cello", "viola", "pizzicato", "quiet sine pulse"],
        "arc": ["question", "encode", "fountain", "wetlab", "consensus", "model", "return", "coda"],
        "timeStretch": False, "subjectiveListeningChecked": False,
        "files": [{"path": f"public/music/{p.name}", "sha256": sha(p)} for p in (music_path, fx_path)],
        "events": events,
    }
    (V3 / "research" / "music-composition-v4.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"music": str(music_path), "transitions": str(fx_path), "events": len(events)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
