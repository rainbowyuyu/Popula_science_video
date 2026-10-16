"""Master full V5 local sources and create an unpadded natural timeline."""
import argparse, json, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from audio_v5_common import ROOT, OUT, TTS, SR, FPS, DEFAULT_STORY, load_story, natural_timeline, sha, save
sys.path.insert(0,str(TTS))
from broadcast_voice import master_voice
from prepare_voice_v3 import split_text

def db_rms(x):return float(20*np.log10(max(float(np.sqrt(np.mean(x*x))),1e-12)))

def main():
    p=argparse.ArgumentParser();p.add_argument('--story',type=Path,default=DEFAULT_STORY)
    p.add_argument('--ready-only',action='store_true',help='Master completed sources only; never write a partial film timeline')
    args=p.parse_args()
    story=load_story(args.story)
    ledger=json.loads((OUT/'voice-generation-v5.json').read_text(encoding='utf8'))
    moduleHash=sha(TTS/'broadcast_voice.py')
    for directory in ('clean','protected','processing'):(OUT/directory).mkdir(parents=True,exist_ok=True)
    durations={}
    for cue in story['cues']:
        raw=OUT/'raw'/f"{cue['id']}.wav";clean=OUT/'clean'/raw.name;report=OUT/'processing'/f"{cue['id']}.json"
        row=ledger.get(cue['id'],{})
        if args.ready_only and (not raw.exists() or not row):continue
        if not raw.exists() or row.get('sha256')!=sha(raw):raise RuntimeError('Missing or changed raw: '+cue['id'])
        if row.get('text')!=cue['spokenText']:raise RuntimeError('Story changed after synthesis: '+cue['id'])
        if row.get('actualProvider')!='local-user-tts-project':raise RuntimeError('Nonlocal source rejected: '+cue['id'])
        old=json.loads(report.read_text(encoding='utf8')) if report.exists() else {}
        if (not clean.exists() or old.get('originalRawSha256')!=sha(raw)
            or old.get('masteringModuleSha256')!=moduleHash or old.get('outputSha256')!=sha(clean)):
            x,sr=sf.read(raw,dtype='float32')
            if x.ndim!=1:raise RuntimeError('Expected mono local raw')
            edge=round(.02*sr)
            edges={'start20msRmsDb':db_rms(x[:edge]),'end20msRmsDb':db_rms(x[-edge:])}
            padded=OUT/'protected'/raw.name
            sf.write(padded,np.pad(x,(round(.08*sr),round(.16*sr))),sr,subtype='PCM_24')
            result=master_voice(padded,clean)
            result.update(originalRawSha256=sha(raw),masteringModuleSha256=moduleHash,
                          preGuardSec=.08,postGuardSec=.16,originalRawEdges=edges)
            save(report,result)
        info=sf.info(clean);rawInfo=sf.info(raw)
        if info.samplerate!=SR or info.channels!=1:raise RuntimeError('Bad clean format')
        if abs(info.duration-(rawInfo.duration+.24))>1/SR:raise RuntimeError('Clip length changed')
        cue.update(rawDuration=rawInfo.duration,audioFile=f'audio/v5/clean/{raw.name}',
                   workingAudioFile=clean.relative_to(ROOT).as_posix())
        durations[cue['id']]=info.duration
    if args.ready_only:
        print(json.dumps({'status':'partial-source-preparation-only','readyCueIds':list(durations),
            'timelineWritten':False},ensure_ascii=False));return
    narr=natural_timeline(story,durations)
    narr['totalRawSpeechClipSec']=sum(c['rawDuration'] for c in narr['cues'])
    narr['totalProtectedClipSec']=sum(c['actualDuration'] for c in narr['cues'])
    captions=[]
    for cue in narr['cues']:
        clauses=split_text(cue['text']);weights=[max(1,len(t)) for t in clauses];used=0
        for index,(text,weight) in enumerate(zip(clauses,weights)):
            start=cue['startSec']+.08+cue['rawDuration']*used/sum(weights);used+=weight
            end=cue['startSec']+.08+cue['rawDuration']*used/sum(weights)
            captions.append({'id':f"{cue['id']}-{index:02d}",'cueId':cue['id'],'shotId':cue['shotId'],
                'startFrame':round(start*FPS),'endFrame':round(end*FPS),'text':text,
                'timingMethod':'full-source-duration; ASR alignment pending'})
    voice=np.zeros((round(narr['durationSec']*SR),2),np.float32)
    for cue in narr['cues']:
        x,sr=sf.read(ROOT/cue['workingAudioFile'],dtype='float32')
        a=round(cue['startSec']*SR);voice[a:a+len(x)]+=x[:,None]
    sf.write(OUT/'narration.wav',voice,SR,subtype='PCM_24')
    save(OUT/'narration.json',narr);save(OUT/'captions.json',captions)
    gaps=[{'from':a['id'],'to':b['id'],'seconds':round(b['startSec']-a['endSec'],6)} for a,b in zip(narr['cues'],narr['cues'][1:])]
    timing={'status':'pass','durationSec':narr['durationSec'],'durationFrames':narr['durationFrames'],
            'targetDeltaSec':narr['targetDeltaSec'],'durationReview':narr['durationReview'],
            'paddingForTargetDuration':False,'timeStretch':False,'truncation':False,
            'gapDefinition':'Gap between complete protected clip extents; model-internal pauses remain unchanged',
            'gaps':gaps,'groups':narr['groups'],'coda':narr['coda'],'rawClipSec':narr['totalRawSpeechClipSec']}
    if any(not .199999<=g['seconds']<=.500001 for g in gaps):raise RuntimeError('Unnatural gap introduced')
    save(OUT/'voice-timing.json',timing)
    print(json.dumps({k:v for k,v in timing.items() if k not in ('gaps','groups')},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
