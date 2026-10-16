"""Source-level audio integrity and caption timing; does not certify listening."""
from pathlib import Path
import hashlib,json,re
import numpy as np
import soundfile as sf
from opencc import OpenCC

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'work/audio-v8';PUBLIC=ROOT/'public/audio/v8'
SIMPLIFIED=OpenCC('t2s')

def db(x):return float(20*np.log10(max(float(x),1e-12)))
def rms(x):return float(np.sqrt(np.mean(np.asarray(x,dtype=np.float64)**2))) if len(x) else 0.
def norm(s):return re.sub(r'[^a-z0-9\u4e00-\u9fff]','',SIMPLIFIED.convert(s).lower())
def main():
    story=json.loads((WORK/'story-v8-measured.json').read_text(encoding='utf8'))
    ledger=json.loads((WORK/'voice-ledger.json').read_text(encoding='utf8'))
    asr=json.loads((WORK/'asr-alignment.json').read_text(encoding='utf8'))
    byid={x['id']:x for x in asr['cues']}
    full,sr=sf.read(PUBLIC/'narration.wav',dtype='float64');rows=[];failures=[];reviews=[]
    for cue in story['sentences']:
        ident=cue['id'];raw,rr=sf.read(WORK/'raw'/f'{ident}.wav');clean,cr=sf.read(PUBLIC/f'{ident}.wav')
        start=round(cue['start']*sr);section=full[start:start+len(clean)]
        error=float(np.max(np.abs(section-clean)))
        prior=raw[max(0,len(raw)-round(.22*rr)):len(raw)-round(.16*rr)]
        presilence=db(rms(prior));lead=db(rms(raw[:round(.06*rr)]));tail=db(rms(raw[-round(.12*rr):]))
        a=byid[ident];target=norm(cue['text']);observed=norm(a['asr'])
        row={'id':ident,'duration':len(clean)/cr,'samples':len(clean),'cleanSampleRate':cr,
            'assemblyMaxAbsoluteError':error,'preservedResampledLength':abs(len(clean)-len(raw)*cr/rr)<=1,
            'lead60msRmsDbFS':lead,'tail120msRmsDbFS':tail,'sourceLast60msBeforeGuardRmsDbFS':presilence,
            'sourcePeakDbFS':db(np.max(np.abs(raw))),'cleanPeakDbFS':db(np.max(np.abs(clean))),
            'alignmentCoverage':a['alignment']['coverage'],'editDistance':a['alignment']['editDistance'],
            'targetFirst':target[:6],'asrFirst':observed[:6],'targetLast':target[-6:],'asrLast':observed[-6:],
            'sourceFirstAndLastMatch':target[:4]==observed[:4] and target[-4:]==observed[-4:],
            'subjectiveListeningChecked':False}
        if error>2/8388608 or not row['preservedResampledLength']:failures.append(ident+' sample integrity')
        if not row['sourceFirstAndLastMatch'] or a['alignment']['coverage']<.88 or presilence>-38:reviews.append(ident)
        rows.append(row)
    caps=story['captions'];previous=0.
    for c in caps:
        if c['end']<=c['start'] or c['start']<previous-.0001 or len(c['text'])>22:failures.append('caption '+c['id'])
        previous=c['end']
    report={'narrationSHA256':hashlib.sha256((PUBLIC/'narration.wav').read_bytes()).hexdigest(),
        'duration':len(full)/sr,'sampleRate':sr,'cueCount':len(rows),'captionCount':len(caps),
        'checks':rows,'technicalFailures':failures,'reviewCues':reviews,
        'technicalChecksPassed':not failures,'subjectiveListeningChecked':False,
        'limitation':'ASR and sample checks do not prove pronunciation, narration tone, or subjective sound quality.'}
    (WORK/'source-audio-audit-v8.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'technicalFailures':failures,'reviewCues':reviews,'duration':len(full)/sr},ensure_ascii=False))
    if failures:raise SystemExit(1)
if __name__=='__main__':main()
