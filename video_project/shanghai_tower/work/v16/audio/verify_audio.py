"""Audit the new stems and source/caption mapping without overstating listening."""
from pathlib import Path
import hashlib,json,math
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[3];WORK=ROOT/'work/v16/audio';OUT=ROOT/'public/v16/audio'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text('utf-8-sig'))
reports=[]
for vertical in [False,True]:
    suffix='-vertical' if vertical else '';prefix='vertical-' if vertical else ''
    tl=read(ROOT/f'src/v16/audio-timeline{suffix}.json');duration=90 if vertical else 360
    assert tl['duration']==duration*30 and tl['voiceSpeedFactor']==1
    narration,sr=sf.read(OUT/(prefix+'narration.wav'),dtype='float32');assert sr==48000
    assert len(narration)==duration*sr and np.isfinite(narration).all()
    expected=np.zeros_like(narration);segments=[]
    for c in tl['clips']:
        w,rate=sf.read(ROOT/'public'/c['audio'],dtype='float32');assert rate==sr
        a=c['start']*1600;b=a+len(w)
        assert b<=c['end']*1600
        expected[a:b]=w
        assert abs(c['startSeconds']-c['start']/30)<1e-9
        assert abs(c['endSeconds']-c['end']/30)<1e-9
        assert abs(c['voiceEndSeconds']-b/sr)<1e-9
        assert c['observationFrames']>=15
        assert c['sourceStart']>=0 and c['sourceEnd']>c['sourceStart']
        original,rate=sf.read(ROOT/'public'/c['sourceAudio'],dtype='float32')
        sourceA,sourceB=[round(x*rate) for x in c['excerptSeconds']]
        reference=original[sourceA:sourceB]*10**(c['gainDB']/20)
        # Tapers affect 8ms only at internal excerpt boundaries; compare the
        # protected interior to prove no time-rate change or hidden DSP.
        margin=math.ceil(.009*rate)
        err=float(np.max(np.abs(w[margin:-margin]-reference[margin:-margin])))
        assert err<3e-7,(c['id'],err)
        segments.append(dict(id=c['id'],samples=len(w),maxInteriorError=err,sha256=sha(ROOT/'public'/c['audio']),
            sourceSHA256=c['sourceSHA256'],voiceStartFrame=c['start'],voiceEndFrame=c['voiceEnd'],observationFrames=c['observationFrames']))
    stemError=float(np.max(np.abs(expected-narration)));assert stemError<=1.3e-7
    for c in tl['captions']:
        clip=next(q for q in tl['clips'] if q['id']==c['clipId'])
        assert clip['start']<=c['start']<c['end']<=clip['voiceEnd']
    assert all(a['end']<=b['start'] for a,b in zip(tl['captions'],tl['captions'][1:]))
    level=read(WORK/(prefix+'audio-report.json'))
    assert level['passed'] and float(level['aacMeasurement']['input_tp'])<=-1
    assert -16<=float(level['aacMeasurement']['input_i'])<=-14
    for name in ['master.wav','music.wav','narration.wav']:
        assert sha(OUT/(prefix+name))==level['hashes'][name]
        assert sf.info(OUT/(prefix+name)).frames==duration*sr
    reports.append(dict(kind='vertical' if vertical else 'main',durationSeconds=duration,passed=True,
        selectedSegments=len(segments),captionCount=len(tl['captions']),maxCaptionCharacters=max(len(c['text']) for c in tl['captions']),
        noAudioTimeStretch=True,rate=1.0,maxStemPlacementError=stemError,segments=segments,
        aacMeasurement=level['aacMeasurement'],voiceOverMusicDB=level['voiceOverMusicActiveDB'],
        subtitleSource='Original source word-aligned captions translated to the selected sentence audio positions',
        subjectiveListeningChecked=False))
report=dict(passed=True,version='v16',renders=reports,
    oldV14AndV15Modified=False,scope='Audio source identity, unmodified speech interiors, source-frame mapping, subtitle bounds, exact stem lengths, mastering and AAC checks; final-video waveform identity must still be tested by root after render.')
(WORK/'audio-acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='renders'},ensure_ascii=False),flush=True)
