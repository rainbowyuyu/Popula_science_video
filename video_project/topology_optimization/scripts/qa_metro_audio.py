"""Audio integrity, source coverage, silence review and equal-level A/B assets."""
from pathlib import Path
import json,hashlib,re
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from math import gcd
R=Path(__file__).resolve().parents[1];Q=R/'research/metro';P=R/'public/metro'
timeline=json.loads((P/'timeline.json').read_text('utf8'))
generation=json.loads((Q/'voice-generation.json').read_text('utf8'))
asr={r['id']:r for r in json.loads((Q/'asr-check.json').read_text('utf8'))['rows']}
mastering={r['id']:r for r in json.loads((Q/'voice-mastering.json').read_text('utf8'))}
rows=[]
def quiet_ranges(y,sr):
    n=round(.02*sr);f=y[:len(y)//n*n].reshape(-1,n);r=np.sqrt(np.mean(f*f,axis=1))
    quiet=r<10**(-45/20);out=[];start=None
    for i,q in enumerate(np.r_[quiet,False]):
        if q and start is None:start=i
        if not q and start is not None:
            out.append({'start':start*.02,'end':i*.02,'seconds':(i-start)*.02});start=None
    return out
for c in timeline['clips']:
    raw=P/'voice-raw'/(c['id']+'.wav'); processed=P/'voice'/(c['id']+'.wav')
    w,sr=sf.read(processed,dtype='float32');r=asr[c['id']]
    assert np.isfinite(w).all() and np.max(np.abs(w))<1
    assert generation[c['id']]['sha256']==hashlib.sha256(raw.read_bytes()).hexdigest()
    assert mastering[c['id']]['outputSha256']==hashlib.sha256(processed.read_bytes()).hexdigest()
    quiet=quiet_ranges(w,sr)
    interior=[q for q in quiet if q['start']>.18 and q['end']<len(w)/sr-.18]
    long=[q for q in interior if q['seconds']>.75]
    rows.append({'id':c['id'],'seconds':len(w)/sr,'asrTextSimilarity':r['textSimilarity'],
        'longInternalQuietRanges':long,'sourceHashVerified':True,'masteringLengthPreserved':mastering[c['id']]['preservedLengthSamples']})
files={}
for name in ['narration.wav','music.wav','master.wav']:
    y,s=sf.read(P/name,dtype='float32',always_2d=True)
    assert len(y)==timeline['duration']*s//30 and np.isfinite(y).all() and np.max(np.abs(y))<1
    files[name]={'seconds':len(y)/s,'sampleRate':s,'channels':y.shape[1],
        'samplePeakDbfs':float(20*np.log10(max(np.max(np.abs(y)),1e-10))),
        'sha256':hashlib.sha256((P/name).read_bytes()).hexdigest()}
def ab(path):
    y,s=sf.read(path,dtype='float32');g=gcd(s,48000);y=resample_poly(y,48000//g,s//g)
    active=np.abs(y)>.005;y*=10**(-22/20)/np.sqrt(np.mean(y[active]**2))
    return y
for mode,folder in [('raw','voice-raw'),('clean','voice')]:
    y=np.concatenate([ab(P/folder/(c['id']+'.wav')) for c in timeline['clips'][:2]])
    sf.write(P/'previews'/f'voice-{mode}-same-level.wav',y,48000,subtype='PCM_16')
report={'sourceClipCount':len(rows),'asrClipCount':len(asr),
    'sourceToTimelineCoverageComplete':set(generation)==set(c['id'] for c in timeline['clips']),
    'timeStretch':False,'pitchShift':False,'codaSeconds':8,'plannedOpeningSeconds':.6,
    'plannedBetweenClipSeconds':4/30,'extraSceneBoundarySeconds':5/30,
    'files':files,'clips':rows,'reviewCandidates':[r for r in rows if r['asrTextSimilarity']<.80 or r['longInternalQuietRanges']],
    'subjectiveListeningChecked':False,'notes':'ASR is an omission/pronunciation screening aid, not proof of a pleasing voice. Final AAC loudness must be measured from the delivered MP4.'}
(Q/'audio-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='clips'},ensure_ascii=False,indent=2))
