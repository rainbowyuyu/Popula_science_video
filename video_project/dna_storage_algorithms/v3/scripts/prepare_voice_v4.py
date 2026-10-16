"""Local V4 voice mastering and timing.  No V3 files are overwritten."""
from pathlib import Path
import sys, json, hashlib, math
import numpy as np
import soundfile as sf
sys.path.insert(0, 'D:/python_project/tts')
from broadcast_voice import master_voice
from prepare_voice_v3 import split_text

V3 = Path(__file__).resolve().parents[1]
OUT = V3 / 'work/audio-v4'
SR = 48000
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    narr = json.loads((V3/'src/narration.json').read_text(encoding='utf8'))
    narr['version'] = 4
    narr['voiceProvider'] = 'local-user-tts-project'
    narr['voiceModel'] = 'Qwen3-TTS-0.6B'
    overridepath=OUT/'speech-overrides.json'
    overrides=json.loads(overridepath.read_text(encoding='utf8')) if overridepath.exists() else {}
    rawdir = OUT/'raw'; destdir = OUT/'clean'; destdir.mkdir(parents=True,exist_ok=True)
    protected = OUT/'protected'; protected.mkdir(parents=True,exist_ok=True)
    reports = OUT/'processing'; reports.mkdir(parents=True,exist_ok=True)
    for cue in narr['cues']:
        cue['spokenText']=overrides.get(cue['id'],cue['spokenText'])
        src = rawdir/f"{cue['id']}.wav"; dst=destdir/src.name; report=reports/f"{cue['id']}.json"
        if not src.exists(): raise RuntimeError('Missing local source '+cue['id'])
        old=json.loads(report.read_text(encoding='utf8')) if report.exists() else {}
        if old.get('originalRawSha256')!=sha(src) or not dst.exists():
            x,sr=sf.read(src,dtype='float32')
            edgeN=round(.02*sr)
            rawEdges={'start20msRmsDb':float(20*np.log10(max(float(np.sqrt(np.mean(x[:edgeN]**2))),1e-12))),
                      'end20msRmsDb':float(20*np.log10(max(float(np.sqrt(np.mean(x[-edgeN:]**2))),1e-12)))}
            x=np.pad(x,(round(.08*sr),round(.16*sr)))
            pad=protected/src.name; sf.write(pad,x,sr,subtype='PCM_24')
            result=master_voice(pad,dst)
            result.update(originalRawSha256=sha(src),preGuardSec=.08,postGuardSec=.16,originalRawEdges=rawEdges)
            report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
        cue['actualDuration']=sf.info(dst).duration
        cue['rawDuration']=sf.info(src).duration
        cue['audioFile']=f"audio/v4/clean/{src.name}"
        cue['workingAudioFile']=dst.relative_to(V3).as_posix()
        cue['oldStartSec']=cue['startSec'];cue['oldEndSec']=cue['endSec']
    rows=[]; cumulativeShift=0.0
    for group in narr['groups']:
        cues=[x for x in narr['cues'] if x['shotId']==group['id']]
        total=sum(x['actualDuration'] for x in cues)
        oldStart=group['startSec'];oldEnd=group['endSec'];window=oldEnd-oldStart
        minimum=.22*(len(cues)-1)+.35+.45
        needed=total+minimum
        if needed>window: window=math.ceil(needed*30)/30
        start=oldStart+cumulativeShift;end=start+window
        group.update(oldStartSec=oldStart,oldEndSec=oldEnd,startSec=start,endSec=end)
        cumulativeShift += window-(oldEnd-oldStart)
        margin=window-total;lead=min(.7,margin*.17);tail=min(1.2,margin*.24)
        gap=(margin-lead-tail)/(len(cues)-1) if len(cues)>1 else 0
        at=start+lead
        for cue in cues:
            cue['startSec']=round(at,6);cue['endSec']=round(at+cue['actualDuration'],6)
            cue['startFrame']=round(at*30);cue['endFrame']=round((at+cue['actualDuration'])*30)
            cue['timingStatus']='measured-local-unscaled';at+=cue['actualDuration']+gap
        rows.append({'shotId':group['id'],'status':'ok','voicedClipSeconds':total,'window':window,
                     'gapSeconds':gap,'leadSeconds':lead,'tailSeconds':tail,'oldStartSec':oldStart,
                     'oldEndSec':oldEnd,'startSec':start,'endSec':end})
    duration=math.ceil((300+cumulativeShift)*30)/30
    narr['durationSec']=duration;narr['durationFrames']=round(duration*30)
    narr['coda']={'oldStartSec':290,'oldEndSec':300,'startSec':290+cumulativeShift,'endSec':duration}
    narr['timeStretch']=False;narr['truncation']=False
    captions=[]
    for cue in narr['cues']:
        clauses=split_text(cue['text']); weights=[len(x) for x in clauses]
        at=cue['startSec']+.08;span=cue['rawDuration'];cumulative=0
        for j,(text,w) in enumerate(zip(clauses,weights)):
            start=at+span*cumulative/sum(weights);cumulative+=w;end=at+span*cumulative/sum(weights)
            captions.append({'id':f"{cue['id']}-{j:02d}",'cueId':cue['id'],'shotId':cue['shotId'],
                'startFrame':round(start*30),'endFrame':round(end*30),'text':text,
                'timingMethod':'raw-clip-duration-weighted-clause; ASR-refinement-pending'})
    narr['totalRawSpeechClipSec']=sum(x['rawDuration'] for x in narr['cues'])
    narr['totalProtectedClipSec']=sum(x['actualDuration'] for x in narr['cues'])
    (OUT/'narration.json').write_text(json.dumps(narr,ensure_ascii=False,indent=2),encoding='utf8')
    (OUT/'captions.json').write_text(json.dumps(captions,ensure_ascii=False,indent=2),encoding='utf8')
    (OUT/'voice-timing.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
    voice=np.zeros((round(duration*SR),2),np.float32)
    for cue in narr['cues']:
        x,sr=sf.read(V3/cue['workingAudioFile'],dtype='float32'); assert sr==SR
        a=round(cue['startSec']*SR);voice[a:a+len(x)]+=x[:,None]
    sf.write(OUT/'narration.wav',voice,SR,subtype='PCM_24')
    print(json.dumps({'durationSec':duration,'rawSpeechSeconds':narr['totalRawSpeechClipSec'],
                     'captionCount':len(captions),'groups':rows},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
