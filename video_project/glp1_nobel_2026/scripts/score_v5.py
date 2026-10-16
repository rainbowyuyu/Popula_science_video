"""餐后晴光: new F-major 4/4 chamber-pop score for the V5 health story.

Only the CC0 instrument sampler is shared with older films. Melodies, harmonic
sequence, meter and arranging rules below are new. V5-only writes; bounded
audio blocks support 15+ minute films without keeping the whole mix in RAM.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, oaconvolve

from acoustic_bank import AcousticBank
from audio_v5_common import AUDIO, RESEARCH, ROOT, SR, read, save, sha, within

TITLE = '餐后晴光'
SEED = 2026100951
ARRANGEMENTS = {
    'flow': dict(bpm=94., lead=.76, pulse=.72, strings=.42),
    'air': dict(bpm=88., lead=.68, pulse=.46, strings=.34),
}
# F major / D minor / warm B-flat colour; separate harmony from the prior D-major waltz.
HARMONY = {
    'F6': (41, [57, 60, 65, 69]), 'C/E': (40, [55, 60, 64, 67]),
    'Dm9': (38, [57, 60, 64, 69]), 'Bbmaj7': (46, [57, 62, 65, 69]),
    'Gm9': (43, [58, 62, 65, 69]), 'Csus': (48, [55, 60, 65, 67]),
    'C': (48, [55, 60, 64, 67]), 'F/A': (45, [57, 60, 65, 69]),
}
PROGRESSIONS = {
    'warm': ['F6','C/E','Dm9','Bbmaj7','F/A','Gm9','Csus','F6'],
    'mechanism': ['Dm9','F/A','Bbmaj7','Csus','Gm9','Dm9','C/E','Csus'],
    'action': ['Bbmaj7','F/A','Gm9','C','F6','Dm9','Bbmaj7','C'],
    'evidence': ['F/A','Bbmaj7','Dm9','C/E','Gm9','Bbmaj7','Csus','F6'],
    'reflect': ['Dm9','Bbmaj7','F/A','Gm9','Bbmaj7','C/E','Csus','F6'],
    'resolve': ['Bbmaj7','C','F/A','Dm9','Gm9','C','F6','F6'],
}
# New four-beat, two-bar question/answer phrasing: (onset beat, MIDI, held beats).
# Motif A: A-C-D, C-A-G / F-A-G-E-F; no prior film's note events are imported.
MELODY_A = [
    [(0.5,69,.65),(1.5,72,.45),(2.25,74,1.25)],
    [(0.25,72,.65),(1.25,69,.75),(3.,67,.65)],
    [(0.,65,1.0),(1.5,69,.60),(2.5,67,.45)],
    [(0.5,64,.75),(2.,65,1.7)],
    [(0.25,69,.5),(1.,72,1.15),(3.,76,.55)],
    [(0.5,74,.8),(2.,72,1.2)],
    [(0.,67,.6),(1.5,69,.6),(2.5,67,.65)],
    [(0.5,65,2.1)],
]
MELODY_B = [
    [(0.75,72,.6),(2.,74,1.1)], [(0.25,77,1.1),(2.5,76,.65)],
    [(0.5,74,.75),(2.,72,.65)], [(1.,69,1.8)],
    [(0.,70,1.0),(1.75,69,.55),(3.,67,.55)], [(0.5,65,1.2),(2.5,69,.6)],
    [(0.,67,.55),(1.25,64,.55),(2.5,67,.7)], [(0.75,65,2.2)],
]
PROFILES = {
    'warm': dict(lead=1., pulse=.6, strings=.25, percussion=.0),
    'mechanism': dict(lead=.38, pulse=.55, strings=.38, percussion=.05),
    'action': dict(lead=.60, pulse=1., strings=.45, percussion=.32),
    'evidence': dict(lead=.30, pulse=.38, strings=.45, percussion=0.),
    'reflect': dict(lead=.36, pulse=.25, strings=.28, percussion=0.),
    'resolve': dict(lead=.90, pulse=.65, strings=.62, percussion=.08),
}


def default_cues(seconds):
    # Preview only. Full composition should use the measured narration's cues.
    labels = ['warm', 'mechanism', 'action', 'evidence', 'reflect', 'resolve']
    return [dict(start=i*seconds/6, end=(i+1)*seconds/6, cue=label)
            for i, label in enumerate(labels)]


def timeline_cues(path):
    tl = read(path)
    fps = tl.get('fps', 30)
    intervals = []
    for row in tl.get('clips', []):
        cue = row.get('musicCue', 'mechanism')
        if cue not in PROFILES:
            raise ValueError(f'Unknown music cue {cue}')
        item = dict(start=row['start']/fps, end=row['end']/fps, cue=cue)
        if intervals and intervals[-1]['cue'] == cue and abs(intervals[-1]['end']-item['start']) < .1:
            intervals[-1]['end'] = item['end']
        else:
            intervals.append(item)
    if not intervals:
        raise ValueError('Timeline has no clips for music cues')
    seconds = tl.get('duration', tl.get('durationFrames'))/fps
    intervals[0]['start'] = 0
    intervals.append(dict(start=intervals[-1]['end'], end=seconds, cue='resolve'))
    return seconds, intervals


def compose_events(seconds, arrangement='flow', cues=None):
    if seconds < 8:
        raise ValueError('Composition must be at least 8 seconds')
    config = ARRANGEMENTS[arrangement]
    bpm = config['bpm']
    beat = 60/bpm
    bar_seconds = 4*beat
    cues = cues or default_cues(seconds)
    rng = np.random.default_rng(SEED)
    events = []
    bars = []

    def add(inst, note, at, duration, velocity, pan, cue, role, variant=0):
        if at >= seconds-2.5 or duration <= 0 or velocity <= 0:
            return
        events.append(dict(instrument=inst, midi=int(note), at=round(max(0,at),6),
            seconds=round(duration,6), velocity=round(velocity,6), pan=pan,
            cue=cue, role=role, variation=int(variant % 2)))

    count = math.ceil((seconds-4)/bar_seconds)
    for bar in range(count):
        at = .18+bar*bar_seconds
        cue = next((x['cue'] for x in cues if x['start'] <= at < x['end']), 'resolve')
        profile = PROFILES[cue]
        pos = bar % 8
        phrase = bar//8
        key = PROGRESSIONS[cue][pos]
        bass, chord = HARMONY[key]
        # Gradual phrase-level breathing, plus an occasional stripped-down phrase.
        lift = .88+.12*math.sin(math.pi*pos/7)
        stripped = phrase % 5 == 3 and cue not in ('action','resolve')
        bars.append(dict(bar=bar, at=round(at,6), cue=cue, chord=key, stripped=stripped))
        jitter = lambda: float(rng.uniform(-.008,.008))
        add('piano', bass+12, at+jitter(), bar_seconds+.5, .26*lift, -.12, cue, 'bass', bar)
        # Airy, short voicings, avoiding continuous midrange strings under speech.
        if not stripped or pos % 2 == 0:
            for index in [0,2]:
                add('piano', chord[index], at+(.85+index*.04)*beat+jitter(), 1.6,
                    .13*lift, -.16+.14*index, cue, 'harmony', bar)
        if cue in ('warm','action','resolve') and pos % 2 == 1:
            add('harp', chord[3]+12, at+3.25*beat, 1.7, .11, .27, cue, 'answer', bar)

        line = MELODY_B if phrase % 4 in (1,3) else MELODY_A
        # Dense reasoning leaves entire bars free of melody.
        play_lead = cue in ('warm','resolve') or (pos in (0,2,5) and not stripped)
        if play_lead:
            for note_index,(off,note,held) in enumerate(line[pos]):
                # F major pitches; Bb instead of A over the minor G harmony.
                if key == 'Gm9' and note == 69:
                    note = 70
                if key in ('C','C/E') and note == 65 and pos != 7:
                    note = 64
                inst = 'harp' if phrase % 4 == 2 else 'piano'
                # Small response octave shift every fourth phrase, no wholesale transpose loop.
                register = -12 if stripped else 0
                add(inst, note+register, at+off*beat+jitter(), max(.9,held*beat+.45),
                    .38*config['lead']*profile['lead']*lift, .10 if inst=='piano' else .23,
                    cue, 'melody', bar+note_index)

        pulse = config['pulse']*profile['pulse']
        pulse_beats = [0.,2.5] if cue != 'action' else [0.,1.5,2.75,3.5]
        if not stripped:
            for index,off in enumerate(pulse_beats):
                note = bass+12 if index%2==0 else bass+19
                add('pizz', note, at+off*beat+jitter(), .9, .23*pulse,
                    -.08 if index%2==0 else .08, cue, 'pulse', bar+index)
        # Bowed colour arrives and leaves in phrases, instead of an unbroken drone.
        if bar%2==0 and phrase%3 != 1:
            strength = config['strings']*profile['strings']
            add('cello', bass+12, at-.08, 2*bar_seconds+.1, .30*strength, -.2, cue, 'bow', bar)
            if pos in (2,6) or cue=='resolve':
                add('viola', chord[1]+12, at+.3, bar_seconds+.4, .20*strength, .20, cue, 'bow', bar)
        if profile['percussion']:
            for off in (1.,3.):
                add('tap', 60, at+off*beat, .20, .075*profile['percussion'], -.02, cue, 'light-percussion', bar)

    # Actual final cadence: newly voiced F(add6/9), followed by room decay.
    cadence = max(0,seconds-5.0)
    for i,note in enumerate([41,53,60,65,69,74]):
        add('piano', note, cadence+.07*i, 5.0-.07*i, .23 if i<3 else .28,
            -.12+.045*i, 'resolve', 'cadence', i)
    events.sort(key=lambda event:event['at'])
    return dict(title=TITLE, arrangement=arrangement, tempoBpm=bpm, meter='4/4',
        tonality='F major / D minor', seed=SEED, durationSeconds=seconds,
        cues=cues, bars=bars, events=events, eventCount=len(events),
        instrumentCounts=dict(Counter(e['instrument'] for e in events)),
        melodyDefinitionSHA256=hashlib.sha256(json.dumps([MELODY_A,MELODY_B],sort_keys=True).encode()).hexdigest(),
        reusedPriorMelody=False, source='New note events and arrangement; existing VSCO 2 CE CC0 isolated instrument samples',
        subjectiveListeningChecked=False)


def render(composition, output, sample_rate=SR):
    output = within(output, AUDIO / 'music')
    output.parent.mkdir(parents=True, exist_ok=True)
    seconds = composition['durationSeconds']
    n = round(seconds*sample_rate)
    bank = AcousticBank(sample_rate)
    events = composition['events']
    # Short, restrained diffuse room; no expensive full-film convolution array.
    rng = np.random.default_rng(SEED+7)
    ir_n = round(.85*sample_rate)
    tt = np.arange(ir_n)/sample_rate
    ir = rng.normal(0,1,(ir_n,2)).astype(np.float32)*np.exp(-tt[:,None]/.17)
    ir[:round(.025*sample_rate)] = 0
    ir = sosfilt(butter(2,2900,fs=sample_rate,output='sos'),ir,axis=0).astype(np.float32)
    ir /= max(float(np.sqrt(np.sum(ir*ir,axis=0)).max()),1e-9)
    ir *= .10
    block_n = 32*sample_rate
    halo = round(1.0*sample_rate)
    temp = output.with_stem(output.stem+'.unscaled')
    peak = 0.
    with sf.SoundFile(temp,'w',samplerate=sample_rate,channels=2,subtype='FLOAT') as writer:
        for start in range(0,n,block_n):
            end = min(n,start+block_n)
            begin = max(0,start-halo)
            dry = np.zeros((end-begin,2),np.float32)
            for event in events:
                offset = round(event['at']*sample_rate)
                event_end = offset+round(event['seconds']*sample_rate)
                if event_end <= begin or offset >= end:
                    continue
                wave = bank.note(event['instrument'],event['midi'],event['seconds'],
                                 event['velocity'],event['variation'])
                mono = wave.mean(axis=1)
                side = (wave[:,0]-wave[:,1])*.15
                angle = (event['pan']+1)*np.pi/4
                stereo = np.stack([mono*np.cos(angle)*1.414+side,mono*np.sin(angle)*1.414-side],axis=1)
                left,right = max(begin,offset),min(end,offset+len(stereo))
                dry[left-begin:right-begin] += stereo[left-offset:right-offset]
            wet = dry.copy()
            for channel in range(2):
                wet[:,channel] += oaconvolve(dry[:,channel],ir[:,channel],mode='full')[:len(dry)]
            wet = sosfilt(butter(2,48,fs=sample_rate,btype='highpass',output='sos'),wet,axis=0).astype(np.float32)
            speech_band = sosfilt(butter(2,[2000,4200],fs=sample_rate,btype='bandpass',output='sos'),wet,axis=0)
            wet -= speech_band.astype(np.float32)*.18
            out = wet[start-begin:]
            time = np.arange(start,end,dtype=np.float32)/sample_rate
            fadein = np.sin(np.clip(time/1.2,0,1)*np.pi/2)**2
            fadeout = np.sin(np.clip((seconds-time)/2.8,0,1)*np.pi/2)**2
            out *= (fadein*fadeout)[:,None]
            if not np.isfinite(out).all():
                raise ValueError('Nonfinite score block')
            peak = max(peak,float(np.abs(out).max(initial=0)))
            writer.write(out)
    gain = .5/max(peak,1e-9)
    with sf.SoundFile(temp) as reader, sf.SoundFile(output,'w',samplerate=sample_rate,channels=2,subtype='PCM_24') as writer:
        while True:
            data = reader.read(block_n,dtype='float32',always_2d=True)
            if not len(data):
                break
            writer.write(data*gain)
    temp.unlink()
    return dict(path=output.relative_to(ROOT).as_posix(),sha256=sha(output),
                sampleRate=sample_rate,samples=n,durationSeconds=seconds,
                peakBeforeNormalization=peak,normalizationGain=gain,peakDBFS=-6.0206,
                subjectiveListeningChecked=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds',type=float,default=96.)
    parser.add_argument('--timeline',type=Path)
    parser.add_argument('--arrangement',choices=ARRANGEMENTS,default='flow')
    parser.add_argument('--name',default='preview-flow')
    parser.add_argument('--events-only',action='store_true')
    args = parser.parse_args()
    if not __import__('re').fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}',args.name):
        parser.error('name must be a simple filename stem')
    seconds,cues = timeline_cues(args.timeline) if args.timeline else (args.seconds,None)
    composition = compose_events(seconds,args.arrangement,cues)
    manifest_path = ROOT/'research/music/samples/manifest.json'
    manifest = read(manifest_path)
    actual = {}
    for item in manifest['files']:
        path = ROOT/'research/music/samples'/item['path']
        digest = sha(path)
        if digest != item['sha256']:
            raise ValueError(f"Sample source changed: {item['path']}")
        actual[item['path']] = digest
    composition['sourceIdentity'] = dict(samplerSHA256=sha(ROOT/'scripts/acoustic_bank.py'),
        scoreScriptSHA256=sha(Path(__file__)),manifestSHA256=sha(manifest_path),
        sampleLicense=manifest['license'],sampleFilesSHA256=actual)
    if args.timeline:
        composition['timelineSHA256'] = sha(args.timeline)
    save(RESEARCH/'music'/f'{args.name}-events.json',composition)
    if not args.events_only:
        result = render(composition,AUDIO/'music'/f'{args.name}.wav')
        save(RESEARCH/'music'/f'{args.name}-render.json',result)
        print(json.dumps(result,ensure_ascii=False),flush=True)
    else:
        print('EVENTS',len(composition['events']),flush=True)


if __name__=='__main__':
    main()
