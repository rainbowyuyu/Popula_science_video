"""Build the deterministic V2 narration/music master."""
from __future__ import annotations
from pathlib import Path
import argparse, json, math, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfiltfilt

ROOT = Path(__file__).resolve().parents[2]
V2 = ROOT / 'v2'
SR = 48000

def db(x): return 20 * math.log10(max(float(x), 1e-12))
def rms(x): return float(np.sqrt(np.mean(np.square(x), dtype=np.float64) + 1e-12))
def mono_resample(x, rate):
    x = x.mean(axis=1) if x.ndim > 1 else x
    x = np.asarray(x, dtype=np.float32)
    if rate != SR:
        g = math.gcd(int(rate), SR)
        x = resample_poly(x, SR // g, int(rate) // g).astype(np.float32)
    return x
def clean(x, rate):
    x = mono_resample(x, rate)
    if len(x) > 128: x = sosfiltfilt(butter(4, [75, 12000], btype='bandpass', fs=SR, output='sos'), x).astype(np.float32)
    x -= np.mean(x, dtype=np.float64)
    x *= np.float32(10 ** ((-20 - db(rms(x))) / 20))
    peak = np.max(np.abs(x)) + 1e-9
    if peak > 0.94: x *= np.float32(0.94 / peak)
    fade = min(len(x) // 8, int(SR * 0.012))
    if fade: x[:fade] *= np.linspace(0, 1, fade, dtype=np.float32); x[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return x
def fit(x, n):
    # Never hide an overlong sentence by changing its speed or pitch.  The
    # narration generator must shorten/re-record it so the authored timing
    # remains natural and the cue boundary stays meaningful.
    if len(x) > n:
        raise RuntimeError(f'narration clip {len(x) / SR:.3f}s exceeds cue window {n / SR:.3f}s')
    return x

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--force', action='store_true'); args = parser.parse_args()
    timeline = json.loads((V2 / 'src/timeline.json').read_text(encoding='utf8'))
    total = int(round(timeline['durationSec'] * SR))
    voice = np.zeros(total, dtype=np.float32); activity = np.zeros(total, dtype=np.float32)
    raw = V2 / 'public/audio/raw'; missing = []; clips = []
    for i, cue in enumerate(timeline['narration']):
        path = raw / f'{i:03d}.wav'; start = int(round(cue['startSec'] * SR)); end = int(round(cue['endSec'] * SR))
        row = {'id': f'{i:03d}', 'startSec': cue['startSec'], 'endSec': cue['endSec'], 'file': path.as_posix(), 'text': cue['text']}
        if not str(cue.get('text', '')).strip():
            # Intentional visual-only cue: reserve its timeline window for
            # evidence/reading room without synthesizing or padding speech.
            row.update(status='silent', seconds=0.0)
            clips.append(row)
            continue
        if not path.exists(): missing.append(f'{i:03d}'); row['status'] = 'missing'; clips.append(row); continue
        data, rate = sf.read(path, dtype='float32'); clip = fit(clean(data, int(rate)), end - start); stop = min(total, start + len(clip)); voice[start:stop] += clip[:stop - start]; activity[max(0, start - int(.18 * SR)):min(total, stop + int(.22 * SR))] = 1; row.update(status='ok', seconds=len(clip) / SR); clips.append(row)
    if missing and not args.force: raise SystemExit(f'missing voice clips: {", ".join(missing)}')
    music_path = ROOT / 'public/music/dna_ambient.wav'
    music, rate = sf.read(music_path, dtype='float32'); music = mono_resample(music, int(rate)); music = np.tile(music, int(math.ceil(total / len(music))))[:total]; music -= np.mean(music, dtype=np.float64); music *= np.float32(10 ** ((-31 - db(rms(music))) / 20))
    window = max(1, int(.12 * SR)); env = np.convolve(activity, np.ones(window, dtype=np.float32) / window, mode='same'); music *= (1 - .87 * np.clip(env, 0, 1)).astype(np.float32)
    mix = voice + music; peak = np.max(np.abs(mix)) + 1e-9
    # Leave headroom for the final AAC encoder.  A single global gain keeps
    # the waveform intact and avoids hard clipping while targeting about
    # -1.5 dBFS true-peak on the PCM master.
    peak_limit = np.float32(10 ** (-1.5 / 20))
    if peak > peak_limit: mix *= np.float32(peak_limit / peak)
    out = V2 / 'public/audio'; out.mkdir(parents=True, exist_ok=True); sf.write(out/'narration.wav', np.stack([voice, voice], axis=1), SR, subtype='PCM_24'); sf.write(out/'master.wav', np.stack([mix, mix], axis=1), SR, subtype='PCM_24')
    final_peak = np.max(np.abs(mix)) + 1e-9
    manifest = {'sampleRate': SR, 'durationSec': total / SR, 'missing': missing, 'clips': clips, 'sourceMusic': music_path.as_posix(), 'output': (out/'master.wav').as_posix(), 'voiceRmsDb': db(rms(voice)), 'musicRmsDb': db(rms(music)), 'mixRmsDb': db(rms(mix)), 'peakDb': db(final_peak), 'peakLimitDb': -1.5, 'timeStretch': False, 'fitPolicy': 'reject-overlong-clips', 'silentCueIds': [row['id'] for row in clips if row.get('status') == 'silent']}
    (V2 / 'delivery_v2').mkdir(parents=True, exist_ok=True); (V2 / 'delivery_v2/audio-mix-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8'); print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
