"""Validate final audio lengths, protected boundaries, hashes and source licenses."""
from pathlib import Path
import json
import numpy as np
import soundfile as sf
from voice import ROOT,read,save,sha

tl=read(ROOT/'public/timeline.json');samples=tl['duration']*1600
# Runtime is defined by the measured timeline, not an obsolete editorial cap.
checks={};assert tl['fps']==30 and isinstance(tl['duration'],int) and tl['duration']>0
assert tl['durationFrames']==tl['duration']
assert abs(tl['durationSeconds']-tl['duration']/tl['fps'])<1e-9
assert tl['outro']['end']==tl['duration'] and tl['outro']['start']<tl['outro']['end']
assert read(ROOT/'src/timeline.json')==tl
for name in ['narration.wav','music.wav','master.wav']:
    p=ROOT/'public'/name;w,sr=sf.read(p,dtype='float32',always_2d=True)
    assert sr==48000 and len(w)==samples and np.isfinite(w).all()
    clips=int(np.sum(np.abs(w)>=.999));assert clips==0
    checks[name]=dict(samples=len(w),sampleRate=sr,channels=w.shape[1],clippedSamples=clips,
                     peakDBFS=float(20*np.log10(max(float(abs(w).max()),1e-12))),sha256=sha(p))
    if name=='narration.wav':
        tail=w[tl['outro']['start']*1600:]
        assert np.max(abs(tail))==0
        checks[name]['silentReferencesTailSeconds']=len(tail)/sr
for prev,current in zip(tl['clips'],tl['clips'][1:]):assert current['start']>=prev['end']
for c in tl['clips']:
    info=sf.info(ROOT/'public'/c['audio']);assert c['start']*1600+info.frames<=c['end']*1600
    assert sha(ROOT/'public'/c['audio'])==c['audioSHA256']
    assert 0<=c['start']<c['end']<=tl['outro']['start']
    assert abs(info.duration-c['voiceDurationSeconds'])<1/48000
    asr=read(ROOT/'audio/asr'/f"{c['id']}.json")
    assert asr['sourceSHA256']==c['audioSHA256']
for a,b in zip(tl['captions'],tl['captions'][1:]):assert b['start']>=a['end']
assert all(c['end']>c['start'] for c in tl['captions'])
assert all(c['end']-c['start']>=18 for c in tl['captions'])
assert len(tl['captions'])>len(tl['clips'])
assert sha(ROOT/'audio/ShanghaiTower.srt')==sha(ROOT/'delivery/ShanghaiTower.srt')
report=read(ROOT/'research/audio-report.json')
if report.get('requestedMusicSource'):
    music_source=report['requestedMusicSource']
    supplied_path=Path(music_source.get('localPath',music_source.get('path','')))
    assert supplied_path.is_file() and sha(supplied_path)==music_source['sha256']
    source_license='User-provided local recording; source identity and user selection recorded'
    source_files_checked=1
else:
    manifest=read(ROOT/'audio/music_source/samples/manifest.json')
    for row in manifest['files']:assert sha(ROOT/'audio/music_source/samples'/row['path'])==row['sha256']
    source_license=manifest['license'];source_files_checked=len(manifest['files'])
assert -16<=float(report['masterMeasurement']['input_i'])<=-14
assert float(report['aacMeasurement']['input_tp'])<=-1
assert 16<=report['voiceOverMusicActiveDB']<=20
save(ROOT/'research/audio-validation.json',dict(passed=True,durationSeconds=samples/48000,totalFrames=tl['duration'],
    voiceCount=len(tl['clips']),captionCount=len(tl['captions']),sourceLicense=source_license,
    sourceFilesHashChecked=source_files_checked,voiceSpeedFactor=1,subjectiveListeningChecked=False,
    timelineSHA256=sha(ROOT/'public/timeline.json'),srtSHA256=sha(ROOT/'delivery/ShanghaiTower.srt'),
    minimumCaptionFrames=min(c['end']-c['start'] for c in tl['captions']),checks=checks))
print(json.dumps(dict(passed=True,durationSeconds=samples/48000,voiceCount=len(tl['clips']),captionCount=len(tl['captions']),
    voiceOverMusicActiveDB=report['voiceOverMusicActiveDB']),ensure_ascii=False),flush=True)
