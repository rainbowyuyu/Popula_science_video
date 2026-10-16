"""Frame-synchronized, original underwater narration treatment + crossing SFX.
Run with D:/python_project/tts/.venv/Scripts/python.exe. Never edits narration.wav.
No TTS, resampling, voice pitch shift, VAD trimming, time stretch or noise gate.
"""
from pathlib import Path
import hashlib
import json
import os
import numpy as np
import soundfile as sf
from scipy import signal, ndimage

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work/audio-v4'
PUBLIC = ROOT / 'public/audio'
SR = 48000
SEED = 4132026


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def db(x):
    return float(20 * np.log10(max(float(x), 1e-12)))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64)))) if len(x) else 0.0


def metrics(x):
    return {'rmsDbFS': db(rms(x)), 'samplePeakDbFS': db(np.max(np.abs(x))),
            'finite': bool(np.isfinite(x).all())}


def bandpass(x, low, high, order=2):
    return signal.sosfiltfilt(signal.butter(order, [low, high], btype='bandpass', fs=SR, output='sos'), x).astype(np.float32)


def band_energy(x):
    if x.ndim > 1:
        x = x.mean(axis=1)
    frequency, power = signal.welch(x, SR, nperseg=8192)
    total = max(float(np.trapezoid(power, frequency)), 1e-20)
    return {f'{lo}-{hi}Hz': round(float(np.trapezoid(power[(frequency >= lo) & (frequency < hi)], frequency[(frequency >= lo) & (frequency < hi)]) / total), 6)
            for lo, hi in [(0, 100), (100, 500), (500, 2000), (2000, 4000), (4000, 12000), (12000, 24000)]}


def crossing_sfx(kind, ordinal):
    """Original seeded noise/oscillator sound, deliberately quiet under speech."""
    rng = np.random.default_rng(SEED + ordinal * 197)
    before, after = (.26, 1.35) if kind == 'enter' else (.18, 1.05)
    t = np.arange(round((before + after) * SR), dtype=np.float64) / SR - before
    result = np.zeros((len(t), 2), dtype=np.float32)
    for channel in range(2):
        noise = rng.normal(size=len(t)).astype(np.float32)
        # Air-to-water transition keeps a soft, low splash rather than a sharp
        # cinema impact in the speech-presence band.
        cloud = bandpass(noise, 100, 1800 if kind == 'enter' else 3600)
        cloud /= max(rms(cloud), 1e-8)
        attack = np.exp(-.5 * ((t + .035) / .085) ** 2)
        afterwash = np.where(t >= 0, np.exp(-np.maximum(t, 0) / (.34 if kind == 'enter' else .21)), 0)
        prewash = np.exp(-.5 * ((t + .13) / .055) ** 2)
        result[:, channel] += cloud * (.30 * attack + .12 * afterwash + .025 * prewash)
        # Small damped resonances resemble trapped bubbles. Frequencies are
        # seeded and each has a short, smooth attack: no isolated digital clicks.
        for bubble in range(6 if kind == 'enter' else 4):
            onset = .045 + bubble * .11 + rng.uniform(-.015, .018)
            local = np.maximum(t - onset, 0)
            active = t >= onset
            freq = rng.uniform(380, 1050)
            envelope = (1 - np.exp(-local / .005)) * np.exp(-local / .047) * active
            phase = 2 * np.pi * freq * (.7 * local + .3 * .045 * (1 - np.exp(-local / .045)))
            result[:, channel] += np.sin(phase) * envelope * (.10 / (1 + bubble * .3))
    # Common slow displacement gives the crossing a single centre instead of
    # two unrelated splashes; stereo detail remains low.
    low = np.sin(2 * np.pi * (95 * t + 12 * t ** 2)) * np.exp(-.5 * ((t - .03) / .08) ** 2)
    result += low[:, None].astype(np.float32) * .13
    edge = max(1, round(SR * .012))
    fade = np.sin(np.linspace(0, np.pi / 2, edge)) ** 2
    result[:edge] *= fade[:, None]
    result[-edge:] *= fade[::-1, None]
    peak = .060 if kind == 'enter' else .045
    result *= peak / max(float(np.max(np.abs(result))), 1e-8)
    return result, before


def underwater_bubble_bed(intervals):
    """Quiet, deterministic trapped-bubble bed for the camera's underwater spans.

    It is intentionally sparse and sits below the narration and crossing cue:
    each bubble has a soft 8 ms attack, a short resonance and a low-frequency
    body.  Absolute event times come from the immersion timeline so seeking and
    offline Remotion renders remain reproducible.
    """
    rng = np.random.default_rng(SEED + 9901)
    pairs = [(float(x['start']), float(x['end'])) if isinstance(x, dict) else (float(x[0]), float(x[1])) for x in intervals]
    count = round(max((b for _, b in pairs), default=0) * SR)
    bed = np.zeros((count, 2), dtype=np.float32)
    for start, end in pairs:
        t = float(start) + .62
        ordinal = 0
        while t < float(end) - .35:
            t += float(rng.uniform(.68, 1.42))
            if t >= float(end) - .24:
                break
            dur = float(rng.uniform(.10, .24)); n = max(8, round(dur * SR))
            local = np.arange(n, dtype=np.float64) / SR
            f0 = float(rng.uniform(280, 680)); f1 = f0 * float(rng.uniform(1.10, 1.55))
            phase = 2 * np.pi * (f0 * local + (f1 - f0) * local * local / max(2 * dur, 1e-6))
            env = (1 - np.exp(-local / .008)) * np.exp(-local / float(rng.uniform(.055, .105)))
            pulse = (np.sin(phase) * .72 + np.sin(phase * 1.97 + .3) * .20) * env
            # A small sub body reads as a bubble in water without a kick.
            body = np.sin(2 * np.pi * float(rng.uniform(78, 122)) * local) * np.exp(-local / .16) * env
            mono = (pulse + .12 * body).astype(np.float32)
            # Raise the bubble bed 1.5× over the first pass so it reads under
            # narration on phone speakers while remaining well below a crossing cue.
            gain = float(rng.uniform(.015, .0315)) / max(float(np.max(np.abs(mono))), 1e-6)
            mono *= gain
            ix = round(t * SR); hi = min(count, ix + n)
            if ix < 0 or ix >= count:
                ordinal += 1; continue
            pan = float(rng.uniform(-.35, .35)); bed[ix:hi, 0] += mono[:hi-ix] * (1-pan)*.5; bed[ix:hi, 1] += mono[:hi-ix] * (1+pan)*.5
            ordinal += 1
    # Crossfade the beds at the camera waterline, avoiding a hard ambience edge.
    for start, end in pairs:
        a, b = round(float(start)*SR), round(float(end)*SR)
        ramp = min(round(.45*SR), max(1, (b-a)//4))
        if 0 <= a < count: bed[a:min(count,a+ramp)] *= np.sin(np.linspace(0,np.pi/2,min(ramp,count-a)))[:,None]**2
        if 0 < b <= count: bed[max(0,b-ramp):b] *= np.sin(np.linspace(np.pi/2,0,min(ramp,b)))[:,None]**2
    return bed


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    timeline = json.loads((WORK / 'immersion-timeline.json').read_text(encoding='utf-8-sig'))
    source = PUBLIC / 'narration.wav'
    source_sha = sha(source)
    raw, sr = sf.read(source, dtype='float32')
    if sr != SR or raw.ndim != 1:
        raise ValueError(f'Expected original mono 48 kHz narration; found {sr} Hz {raw.shape}')
    times = np.array([s['t'] for s in timeline['samples']])
    frame_envelope = np.array([s['immersion'] for s in timeline['samples']], dtype=np.float64)
    # Symmetric 120 ms smoothing introduces no envelope delay. Interpolation
    # remains locked to original absolute sample positions.
    frame_envelope = ndimage.gaussian_filter1d(frame_envelope, sigma=.12 * timeline['fps'], mode='nearest', truncate=4)
    envelope = np.interp(np.arange(len(raw), dtype=np.float64) / SR, times, frame_envelope).astype(np.float32)
    lowpass = signal.sosfiltfilt(signal.butter(2, 3500, btype='lowpass', fs=SR, output='sos'), raw).astype(np.float32)
    wet = .38 * raw + .62 * lowpass
    voiced = np.abs(raw) > .008
    gain = np.clip(rms(raw[voiced]) / max(rms(wet[voiced]), 1e-8), 1., 1.12)
    wet *= gain * .985
    for delay_ms, amount in [(27, .026), (51, .014)]:
        shift = round(delay_ms / 1000 * SR)
        wet[shift:] += lowpass[:-shift] * amount
    processed = raw + envelope * (wet - raw)
    # Preserve every source sample and reserve headroom without compressing a
    # signal that already fits. No global loudness normalization at this stage.
    applied_gain = min(1., .87 / max(float(np.max(np.abs(processed))), 1e-8))
    processed *= applied_gain
    # Keep V4 as the default for backwards-compatible regeneration. V5/V6
    # deliveries set RAINBOW_AUDIO_VARIANT=v5 so the active Remotion sources
    # are regenerated without mutating the fallback master.
    variant = os.environ.get('RAINBOW_AUDIO_VARIANT', 'v4').strip().lower() or 'v4'
    if variant not in {'v4', 'v5'}:
        raise ValueError('RAINBOW_AUDIO_VARIANT must be v4 or v5')
    narration_path = PUBLIC / f'narration-immersive-{variant}.wav'
    sf.write(narration_path, processed, SR, subtype='PCM_24')

    count = round(timeline['duration'] * SR)
    sfx = np.zeros((count, 2), dtype=np.float32)
    details = []
    for index, event in enumerate(timeline['crossings']):
        sound, before = crossing_sfx(event['kind'], index)
        start = round((event['time'] - before) * SR)
        lo, hi = max(0, start), min(count, start + len(sound))
        sfx[lo:hi] += sound[lo - start:hi - start]
        details.append({**event, 'sfxStart': lo / SR, 'sfxEnd': hi / SR, 'seed': SEED + index * 197,
                        **metrics(sound), 'bandEnergyFraction': band_energy(sound)})
    ambient = underwater_bubble_bed(timeline['underwaterIntervals'])
    if len(ambient) != count:
        ambient = np.pad(ambient, ((0, max(0, count-len(ambient))), (0,0)))[:count]
    sfx += ambient
    sfx_path = PUBLIC / f'water-crossings-{variant}.wav'
    sf.write(sfx_path, sfx, SR, subtype='PCM_24')

    # Numeric sync checks use exact source sample positions, not only duration.
    lag_results = []
    for interval in timeline['underwaterIntervals']:
        lo, hi = round((interval['start'] + .45) * SR), round(min(interval['end'] - .45, interval['start'] + 3.45) * SR)
        corr = signal.correlate(processed[lo:hi], raw[lo:hi], mode='full', method='fft')
        lag_results.append({'start': lo / SR, 'end': hi / SR, 'peakCorrelationLagSamples': int(np.argmax(corr) - (hi - lo - 1))})
    mask = envelope > .95
    report = {
        'schema': f'marine-immersive-audio-{variant}', 'variant': variant, 'subjectiveListeningChecked': False,
        'sampleRate': SR, 'narrationChannels': 1, 'sfxChannels': 2,
        'source': {'path': str(source), 'sha256': source_sha, 'frames': len(raw), 'duration': len(raw) / SR, **metrics(raw)},
        'narration': {'path': str(narration_path), 'sha256': sha(narration_path), 'frames': len(processed), 'duration': len(processed) / SR, **metrics(processed)},
        'sfx': {'path': str(sfx_path), 'sha256': sha(sfx_path), 'frames': count, 'duration': count / SR, **metrics(sfx), 'provenance': 'Original deterministic crossing noise, damped oscillators and sparse underwater bubble bed; no downloaded audio or external samples'},
        'narrationProcessing': {'zeroPhaseLowpassHz': 3500, 'lowpassOrder': 2, 'underwaterDryFraction': .38, 'underwaterLowpassFraction': .62, 'rmsCompensationGain': float(gain), 'earlyReflections': [{'delayMs': 27, 'gain': .026}, {'delayMs': 51, 'gain': .014}], 'envelopeSmoothingSigmaMs': 120, 'outputSafetyGain': float(applied_gain), 'pitchChange': False, 'timeStretch': False, 'trimming': False},
        'underwaterSource': {**metrics(raw[mask]), 'bandEnergyFraction': band_energy(raw[mask])},
        'underwaterProcessed': {**metrics(processed[mask]), 'bandEnergyFraction': band_energy(processed[mask])},
        'crossings': details, 'underwaterIntervals': timeline['underwaterIntervals'], 'underwaterBubbleBed': {'seed': SEED + 9901, 'maxEventsPerInterval': 'deterministic interval spacing 0.68-1.42 s', 'rmsDbFS': db(rms(ambient)), 'peakDbFS': db(np.max(np.abs(ambient))), 'provenance': 'procedural, no external recording'},
        'mergedFalseCrossingGroups': timeline['mergedGroups'], 'correlationSync': lag_results,
        'sourceUnchanged': sha(source) == source_sha, 'sampleCountUnchanged': len(processed) == len(raw),
        'cameraSHA256': timeline['sources']['camera']['sha256'], 'waveSHA256': timeline['sources']['wave']['sha256'],
        'finalAACAndIntegratedMixChecked': False,
    }
    (WORK / 'immersive-audio-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    # Short practical review excerpts, intentionally marked as not listened to.
    for number, event in enumerate(timeline['crossings'], 1):
        lo, hi = max(0, round((event['time'] - 2) * SR)), min(len(raw), round((event['time'] + 3) * SR))
        preview = np.repeat(processed[lo:hi, None], 2, axis=1) + sfx[lo:hi]
        sf.write(WORK / f'crossing-review-{number:02}.wav', preview, SR, subtype='PCM_24')
    print(json.dumps({k: report[k] for k in ['narration', 'sfx', 'correlationSync', 'sourceUnchanged', 'sampleCountUnchanged']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
