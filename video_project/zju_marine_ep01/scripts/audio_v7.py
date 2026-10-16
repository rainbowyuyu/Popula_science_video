"""V7 camera-synchronous immersion mix; preserves every narration sample position.

Run: D:/python_project/tts/.venv/Scripts/python.exe scripts/audio_v7.py
Optional --timeline points to a renderer-exported immersion-timeline.json. If a
native wave renderer changes the waterline, supply its timeline instead of using
the analytic CameraRail/WaterSurfaceState export. No original tracks are modified.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import subprocess
import numpy as np
import soundfile as sf
from scipy import signal, ndimage

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work/audio-v7'
PUBLIC = ROOT / 'public/audio'
REFS = WORK / 'references'
SR = 48000
SEED = 20261014
FFMPEG = 'C:/ffmpeg/bin/ffmpeg.exe'
MUSIC = Path('D:/CloudMusic/MoFeansy,Warsic - 汐渐.mp3')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def rms(x):
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64)))) if len(x) else 0.


def db(x):
    return float(20 * np.log10(max(float(x), 1e-12)))


def stats(x):
    return {'rmsDbFS': db(rms(x)), 'samplePeakDbFS': db(np.max(np.abs(x))),
            'finite': bool(np.isfinite(x).all()), 'frames': len(x), 'duration': len(x) / SR}


def filt(x, cutoff, kind='lowpass', order=3):
    return signal.sosfiltfilt(signal.butter(order, cutoff, kind, fs=SR, output='sos'), x, axis=0).astype(np.float32)


def smooth(x):
    x = np.clip(x, 0., 1.)
    return x * x * (3 - 2 * x)


def match_rms(x, target, max_gain=100):
    return x * min(max_gain, target / max(rms(x), 1e-8))


def edge_fade(x, sec=.025):
    n = min(round(sec * SR), len(x) // 2)
    if n:
        e = np.sin(np.linspace(0, np.pi / 2, n, dtype=np.float32)) ** 2
        x[:n] *= e.reshape((-1,) + (1,) * (x.ndim - 1))
        x[-n:] *= e[::-1].reshape((-1,) + (1,) * (x.ndim - 1))
    return x


def read_audio(path, channels=2):
    # Read downloaded MP3 without changing the immutable source asset.
    decoded = WORK / (Path(path).stem + f'-decoded-{channels}ch.wav')
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', str(path), '-vn', '-ar', str(SR),
                    '-ac', str(channels), '-c:a', 'pcm_f32le', str(decoded)], check=True)
    return sf.read(decoded, dtype='float32')[0]


def export_timeline():
    # Reuse the project's exact export logic, only giving it a V7 destination.
    js = (ROOT / 'scripts/export_immersion.mjs').read_text(encoding='utf-8-sig')
    line = "const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');"
    if line not in js:
        raise RuntimeError('Immersion exporter changed: update the V7 wrapper explicitly')
    js = js.replace(line, 'const root=' + json.dumps(str(ROOT).replace('\\', '/')) + ';')
    js = js.replace("'work/audio-v4'", "'work/audio-v7'").replace('marine-immersion-v4', 'marine-immersion-v7')
    target = WORK / 'export-immersion-v7.mjs'
    target.write_text(js, encoding='utf8')
    subprocess.run(['node', str(target)], cwd=ROOT, check=True)
    return WORK / 'immersion-timeline.json'


def sound_sources():
    records = []
    info = [
        ('705058', 'felix.blume', 'Sea waves underwater, back and forth, close to the rocks with water bubbles',
         'Field recording; Ilo harbor, Peru, recorded 2012; do not claim our scene was recorded underwater.'),
        ('852167', 'KolbyRFX', 'WATRUndwtr_Underwater Submerge Transition_KOLBYR_FREE SOUNDS',
         'Creator describes original hydrophone recordings combined with synthesized/granular elements.'),
    ]
    for ident, author, title, description in info:
        page = REFS / (ident + '.html')
        media = REFS / (ident + '.mp3')
        if not media.exists() or not page.exists():
            raise FileNotFoundError(f'Missing licensed source or license evidence: {ident}')
        html = page.read_text(encoding='utf8')
        if 'http://creativecommons.org/publicdomain/zero/1.0/' not in html:
            raise ValueError(f'CC0 evidence missing for {ident}')
        records.append({'id': ident, 'title': title, 'author': author, 'description': description,
                        'page': f'https://freesound.org/people/{author}/sounds/{ident}/',
                        'license': 'CC0 1.0', 'licenseURL': 'https://creativecommons.org/publicdomain/zero/1.0/',
                        'retrievedDate': '2026-10-14', 'asset': str(media.relative_to(ROOT)),
                        'sha256': sha(media), 'pageSHA256': sha(page),
                        'downloadQuality': 'Freesound HQ MP3 preview; not lossless original'})
    (REFS / 'sources-v7.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf8')
    return records


def bubble(radius_mm, sec, rng):
    # Damped cavity oscillator, inspired by the small-bubble resonance relation.
    # This is sound design, not a calibrated hydro-acoustic solver.
    t = np.arange(round(sec * SR), dtype=np.float32) / SR
    freq = 3280 / radius_mm
    drift = .08 * (1 - np.exp(-t / .033))
    phase = 2 * np.pi * freq * (t + .08 * (t - .033 * (1 - np.exp(-t / .033))))
    env = (1 - np.exp(-t / .004)) * np.exp(-t / rng.uniform(.025, .070))
    out = (np.sin(phase) + .10 * np.sin(phase * 1.95 + .6)) * env
    return edge_fade(out.astype(np.float32), .006)


def add_at(dst, src, time):
    index = round(time * SR)
    lo, hi = max(0, index), min(len(dst), index + len(src))
    if hi > lo:
        dst[lo:hi] += src[lo - index:hi - index]


def source_fragment(source, offset, duration):
    n = round(duration * SR)
    start = round(offset * SR) % max(1, len(source) - n)
    return source[start:start + n].copy()


def make_crossing(kind, index, waves, transition):
    rng = np.random.default_rng(SEED + index * 409)
    before = .28 if kind == 'enter' else .20
    after = 2.65 if kind == 'enter' else 2.25
    n = round((before + after) * SR)
    t = np.arange(n, dtype=np.float32) / SR - before
    src = source_fragment(transition, 4 + index * 7.13, before + after)
    src = filt(src, [70, 3400 if kind == 'enter' else 5200], 'bandpass', 2)
    src = match_rms(src, .065)
    # At the waterline, a close low-frequency displacement blooms, then the
    # recorded current/gurgle takes over. No loud generic cinematic bass hit.
    wash = np.exp(-.5 * ((t + .035) / .14) ** 2) + np.where(t > 0, .55 * np.exp(-np.maximum(t, 0) / .62), 0)
    out = src * wash[:, None]
    noise = filt(rng.standard_normal(n).astype(np.float32), [100, 1800 if kind == 'enter' else 6500], 'bandpass', 2)
    transient = match_rms(noise, .058) * np.exp(-.5 * ((t + .025) / .09) ** 2)
    displacement = .045 * np.sin(2 * np.pi * (91 * t + 15 * t * t)) * np.exp(-.5 * ((t - .012) / .115) ** 2)
    out += (transient + displacement)[:, None]
    for k in range(13 if kind == 'enter' else 8):
        offset = .06 + k * rng.uniform(.066, .135)
        b = bubble(rng.uniform(3.8, 12) if kind == 'enter' else rng.uniform(2, 5), .33, rng)
        b *= rng.uniform(.026, .048) / max(np.max(np.abs(b)), 1e-7) * np.exp(-k / 10)
        pan = rng.uniform(-.6, .6)
        stereo = np.column_stack([b * np.sqrt((1 - pan) / 2), b * np.sqrt((1 + pan) / 2)])
        add_at(out, stereo, offset + before)
    out = edge_fade(out, .04)
    peak = .165 if kind == 'enter' else .135
    out *= min(1, peak / max(np.max(np.abs(out)), 1e-8))
    return out, before


def loudness(path):
    p = subprocess.run([FFMPEG, '-hide_banner', '-i', str(path), '-af',
                        'loudnorm=I=-16:TP=-1.3:LRA=8:print_format=json', '-f', 'null', 'NUL'],
                       capture_output=True, text=True, check=True)
    return json.loads(p.stderr[p.stderr.rfind('{'):p.stderr.rfind('}') + 1])


def choose_music_join(music, first_end, overlap):
    """Match actual recorded harmony/onset patterns, without changing tempo."""
    mono = music.mean(axis=1)[::4]
    rate, hop = SR // 4, 512
    freq, times, z = signal.stft(mono, fs=rate, nperseg=2048, noverlap=2048-hop,
                               boundary=None, padded=False)
    power = np.abs(z).astype(np.float32)
    selected = (freq >= 100) & (freq <= 4000)
    midi = np.rint(69 + 12 * np.log2(np.maximum(freq, 1) / 440)).astype(int)
    chroma = np.stack([power[selected & (midi % 12 == pc)].sum(axis=0) for pc in range(12)])
    chroma /= np.maximum(np.linalg.norm(chroma, axis=0, keepdims=True), 1e-8)
    onset = np.maximum(np.diff(power, axis=1, prepend=power[:, :1]), 0).sum(axis=0)
    onset = (onset-onset.mean()) / max(float(onset.std()), 1e-8)
    goal_start = (first_end-overlap)/SR
    goal = int(np.argmin(np.abs(times-goal_start)))
    width = round(overlap/SR*rate/hop)
    target_c = chroma[:,goal:goal+width]
    target_o = onset[goal:goal+width]
    candidates = np.flatnonzero((times >= 16) & (times <= 72))
    scored = []
    for i in candidates:
        c, o = chroma[:,i:i+width], onset[i:i+width]
        harmony = float(np.mean(np.sum(c*target_c, axis=0)))
        rhythmic = float(np.corrcoef(o, target_o)[0,1])
        scored.append((.78*harmony + .22*rhythmic, i, harmony, rhythmic))
    score, index, harmony, rhythmic = max(scored)
    return round(float(times[index])*SR), {'method':'recorded chroma and spectral-onset match',
        'comparisonSeconds':overlap/SR, 'searchSourceSeconds':[16,72],
        'harmonyCosine':harmony, 'onsetCorrelation':rhythmic, 'weightedScore':score,
        'manualListeningConfirmed':False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--timeline', type=Path)
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    timeline_path = args.timeline or export_timeline()
    timeline = json.loads(timeline_path.read_text(encoding='utf-8-sig'))
    for label, item in timeline.get('sources', {}).items():
        source_file = ROOT / item['path']
        if not source_file.is_file() or sha(source_file) != item['sha256']:
            raise ValueError(f'Immersion timeline has stale {label} source; export it again before mixing')
    sources = sound_sources()
    # Timeline sampling can be 60 Hz while the film is 30 fps. The delivered
    # film's rounded-up frame count owns the duration; never shorten its audio.
    story = json.loads((ROOT / 'src/story.json').read_text(encoding='utf-8-sig'))
    duration = math.ceil(max(s['end'] for s in story['scenes']) * 30) / 30
    if abs(duration-timeline['duration']) > 1/30 + 1e-6:
        raise ValueError('Immersion timeline does not cover the film duration')
    count = round(duration * SR)
    original = PUBLIC / 'narration.wav'
    source_hash = sha(original)
    raw, sr = sf.read(original, dtype='float32')
    if sr != SR or raw.ndim != 1:
        raise ValueError('Original narration must be mono 48 kHz')
    raw_count = len(raw)
    if abs(count - raw_count) > SR / 30 + 1:
        raise ValueError('Timeline/narration duration mismatch exceeds one frame')
    raw = np.pad(raw, (0, max(0, count - len(raw))))[:count]
    frame_t = np.array([s['t'] for s in timeline['samples']])
    frame_e = np.array([s['immersion'] for s in timeline['samples']])
    frame_e = ndimage.gaussian_filter1d(frame_e, .065 * timeline['fps'], mode='nearest')
    seconds = np.arange(count, dtype=np.float64) / SR
    immersion = np.interp(seconds, frame_t, frame_e).astype(np.float32)
    # Keep slight lens/ear drainage for 0.35 s after emerging, but do not smear
    # the actual waterline event or move any syllable in time.
    tail_radius = max(1, round(.15 * timeline['fps']))
    wet_tail = ndimage.maximum_filter1d(frame_e, size=2*tail_radius+1, origin=tail_radius, mode='nearest')
    tail = np.interp(seconds, frame_t, wet_tail).astype(np.float32)
    envelope = np.clip(.91 * immersion + .09 * tail, 0, 1)

    low = filt(raw, [100, 2050], 'bandpass', 3)
    body = filt(raw, [140, 600], 'bandpass', 2)
    clarity = filt(raw, [1300, 3600], 'bandpass', 2)
    wet = .12 * raw + .79 * low + .09 * body + .09 * clarity
    active = np.abs(raw) > .008
    compensation = min(1.18, rms(raw[active]) / max(rms(wet[active]), 1e-8))
    wet *= compensation * .96
    for delay_ms, amount in [(9, .018), (17, .021), (31, .014), (47, .008)]:
        lag = round(delay_ms * SR / 1000)
        wet[lag:] += low[:-lag] * amount
    wet *= (1 + .009 * np.sin(2 * np.pi * seconds * .73) + .004 * np.sin(2 * np.pi * seconds * 1.31)).astype(np.float32)
    narration = raw + envelope * (wet - raw)
    narration *= min(1, .91 / max(np.max(np.abs(narration)), 1e-9))
    narration_path = PUBLIC / 'narration-immersive-v7.wav'
    sf.write(narration_path, narration, SR, subtype='PCM_24')
    del low, body, clarity, wet, active, tail

    # Fast RMS on 10 ms blocks drives smooth music/ambience ducking, not a
    # sentence-level hard gate. Quiet syllable endings remain fully intact.
    blocks = np.pad(raw, (0, (-len(raw)) % 480)).reshape(-1, 480)
    voice_rms = np.sqrt(np.mean(blocks * blocks, axis=1))
    voice_envelope = ndimage.maximum_filter1d(voice_rms, size=25, mode='nearest')
    voice_envelope = ndimage.gaussian_filter1d(voice_envelope, 12)
    voicing = np.interp(seconds, np.arange(len(voice_envelope)) * .01, smooth((voice_envelope - .004) / .045)).astype(np.float32)

    waves = read_audio(REFS / '705058.mp3')
    transition = read_audio(REFS / '852167.mp3')
    waves = filt(waves, [65, 3000], 'bandpass', 2)
    waves = match_rms(waves, .019)
    sfx = np.zeros((count, 2), dtype=np.float32)
    rng = np.random.default_rng(SEED)
    bubble_events = []
    for ordinal, interval in enumerate(timeline['underwaterIntervals']):
        a, b = interval['start'], interval['end']
        # Loop the real 23.2 s recording with a 1.2 s overlap, never a hard cut.
        local_count = round((b - a + 1.0) * SR)
        bed = np.zeros((local_count, 2), dtype=np.float32)
        cursor, segment = 0, 0
        while cursor < local_count:
            frag = source_fragment(waves, ordinal * 4.1 + segment * 2.31, 9.5)
            edge_fade(frag, 1.2)
            hi = min(local_count, cursor + len(frag))
            bed[cursor:hi] += frag[:hi-cursor]
            cursor += round(8.3 * SR)
            segment += 1
        add_at(sfx, bed, a - .4)
        t = a + .45
        while t < b - .2:
            cluster = int(rng.integers(2, 5))
            for k in range(cluster):
                event_t = t + .045 * k + rng.uniform(0, .045)
                pulse = bubble(rng.uniform(3.5, 11.5), .28, rng)
                pulse *= rng.uniform(.021, .046) / max(np.max(np.abs(pulse)), 1e-8)
                pan = rng.uniform(-.60, .60)
                add_at(sfx, np.column_stack([pulse * np.sqrt((1-pan)/2), pulse * np.sqrt((1+pan)/2)]), event_t)
                bubble_events.append({'t': round(event_t, 4), 'pan': round(float(pan), 4)})
            t += rng.uniform(1.15, 2.1)
    sfx *= immersion[:, None] * (.83 - .19 * voicing[:, None])
    crossing_records = []
    for i, crossing in enumerate(timeline['crossings']):
        fx, before = make_crossing(crossing['kind'], i, waves, transition)
        add_at(sfx, fx, crossing['time'] - before)
        crossing_records.append({**crossing, 'assetOnset': crossing['time'] - before,
                                 'duration': len(fx) / SR, **stats(fx)})
    sfx_path = PUBLIC / 'water-crossings-v7.wav'
    sf.write(sfx_path, sfx, SR, subtype='PCM_24')

    music_source = MUSIC if MUSIC.exists() else PUBLIC / 'xijian-source.mp3'
    music = read_audio(music_source)
    # A broad midrange pocket gives the narration space without flattening
    # the user's chosen score. No new composition or unauthorized replacement.
    music -= .27 * filt(music, [900, 3300], 'bandpass', 2)
    music = filt(music, 70, 'highpass', 2)
    music = match_rms(music, .032)
    score = np.zeros((count, 2), dtype=np.float32)
    first_end = min(len(music), round(226 * SR))
    overlap = round(6.4 * SR)
    repeat_start, join_quality = choose_music_join(music, first_end, overlap)
    first = music[:first_end].copy()
    edge_fade(first, 1.6)
    first[-overlap:] *= np.cos(np.linspace(0, np.pi/2, overlap, dtype=np.float32))[:, None]
    score[:len(first)] = first
    cursor = first_end - overlap
    edits = []
    while cursor < count:
        piece = music[repeat_start:first_end].copy()
        piece[:overlap] *= np.sin(np.linspace(0, np.pi/2, overlap, dtype=np.float32))[:, None]
        remaining = count - cursor
        n = min(len(piece), remaining)
        score[cursor:cursor+n] += piece[:n]
        edits.append({'timelineStart': cursor / SR, 'sourceStart': repeat_start / SR, 'overlapSeconds': overlap / SR,
                      'type': 'equal-power overlap; no pitch or tempo change', 'selection':join_quality})
        cursor += len(piece) - overlap
    underwater_music = filt(score, 1800, order=2)
    score += immersion[:, None] * (underwater_music * .65 - score)
    score *= (.95 - .38 * voicing[:, None])
    # Gentle score swell during non-speech gaps; never a sudden start/stop.
    score *= (smooth(seconds/1.7) * smooth((duration-seconds)/3.2)).astype(np.float32)[:, None]
    music_path = PUBLIC / 'episode01-xijian-v7.wav'
    sf.write(music_path, score, SR, subtype='PCM_24')
    del music, first, piece, underwater_music

    premix = narration[:, None] + sfx + score
    pre_path = WORK / 'mix-v7-premaster.wav'
    sf.write(pre_path, premix, SR, subtype='PCM_24')
    measure = loudness(pre_path)
    master_path = PUBLIC / 'episode01-mix-v7.wav'
    audio_filter = ('loudnorm=I=-16:TP=-1.3:LRA=8:'
                    f"measured_I={measure['input_i']}:measured_TP={measure['input_tp']}:"
                    f"measured_LRA={measure['input_lra']}:measured_thresh={measure['input_thresh']}:"
                    f"offset={measure['target_offset']}:linear=true:print_format=json,"
                    f'aresample={SR},apad=whole_len={count},atrim=end_sample={count}')
    result = subprocess.run([FFMPEG, '-hide_banner', '-y', '-i', str(pre_path), '-af', audio_filter,
                             '-c:a', 'pcm_s24le', str(master_path)], capture_output=True, text=True, check=True)
    (WORK / 'mastering-log.txt').write_text(result.stderr, encoding='utf8')
    final_measure = loudness(master_path)
    master, _ = sf.read(master_path, dtype='float32')

    correlations = []
    for interval in timeline['underwaterIntervals']:
        a = round((interval['start'] + .5) * SR)
        b = min(round((interval['start'] + 3.5) * SR), round((interval['end']-.4) * SR))
        corr = signal.correlate(narration[a:b], raw[a:b], method='fft')
        correlations.append({'start': a/SR, 'end': b/SR, 'lagSamples': int(np.argmax(corr) - (b-a-1))})
    previews = []
    for i, event in enumerate(timeline['crossings']):
        lo, hi = max(0, round((event['time']-2)*SR)), min(count, round((event['time']+5)*SR))
        target = WORK / f'crossing-review-v7-{i+1:02}.wav'
        sf.write(target, master[lo:hi], SR, subtype='PCM_24')
        previews.append(str(target.relative_to(ROOT)))
    outputs = {}
    for name, path in [('narration', narration_path), ('sfx', sfx_path), ('music', music_path), ('master', master_path)]:
        outputs[name] = {'path': str(path), 'sha256': sha(path), 'audioInfo': str(sf.info(path))}
    report = {
        'schema': 'marine-immersive-audio-v7', 'duration': count/SR, 'sampleRate': SR,
        'sourceNarration': {'path': str(original), 'sha256': source_hash, 'originalSamples': raw_count,
                            'paddingSamples': count-raw_count, 'unchanged': sha(original)==source_hash},
        'timeline': {'path': str(timeline_path), 'sha256': sha(timeline_path), 'sources': timeline.get('sources'),
                     'backend':timeline.get('backend','analytic'), 'samplingFPS':timeline['fps'],
                     'quality':timeline.get('quality','unspecified'),
                     'gpuSampleCount':timeline.get('gpuSampleCount',0), 'samplingNotes':timeline.get('notes',[]),
                     'backendWarning': 'Regenerate if camera or native-water parameters change; source hashes identify the evaluated version.'},
        'narrationProcessing': {'purpose': 'Cinematic listener perspective, with intentionally preserved Mandarin speech clarity; not simulated physiology',
                                'dryFraction': .12, 'mainPassbandHz': [100, 2050], 'clarityPassbandHz': [1300, 3600],
                                'zeroPhaseFiltering': True, 'timeStretch': False, 'pitchChange': False, 'trimmedSyllables': False,
                                'waterlineSmoothingSigmaMs': 65, 'earlyReflectionTapsMs': [9,17,31,47],
                                'rmsCompensation': float(compensation), 'preservedSourceSamplePositions': True},
        'sfxSources': sources, 'sfxProcessing': 'CC0 field/mixed-source textures + original damped bubble clusters and waterline displacement; same absolute crossing times as camera',
        'music': {'path': str(music_source), 'sha256': sha(music_source), 'title': '汐渐', 'artist': 'MoFeansy,Warsic',
                  'rights': 'User-provided music; no new public-performance or redistribution license is asserted',
                  'edits': edits, 'processing': 'Midrange pocket, continuous speech ducking, underwater lowpass and gain, 3.2s ending'},
        'crossings': crossing_records, 'underwaterIntervals': timeline['underwaterIntervals'], 'bubbleEvents': bubble_events,
        'numericSync': correlations, 'premaster': measure, 'masterLoudness': final_measure,
        'outputs': outputs, 'masterStats': stats(master), 'reviewExcerpts': previews,
        'subjectiveListeningChecked': False, 'fullVideoLipSyncChecked': False,
        'integration': 'Use audio/episode01-mix-v7.wav at volume=1 as the only audio node; do not also mix the three stems. Stems are already ducked for use at unity if remastering.'
    }
    (WORK / 'audio-v7-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({k:report[k] for k in ['duration','masterLoudness','numericSync','masterStats','integration']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
