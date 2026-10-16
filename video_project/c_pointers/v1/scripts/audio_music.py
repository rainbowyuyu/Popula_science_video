"""Measured Hypnotic arrangement and beat positions; no musical time stretching."""
import argparse,json
import numpy as np
import soundfile as sf
from audio_common import ROOT,OUT,MUSIC,SR,FPS,sha,save

def arrange(duration):
    analysis=json.loads((OUT/'music-analysis.json').read_text(encoding='utf8'))
    assert sha(MUSIC)==analysis['sourceSha256']
    x,sr=sf.read(OUT/'music-source.wav',dtype='float32',always_2d=True)
    assert sr==SR and x.shape[1]==2
    loop=next(c for c in analysis['phraseCandidates'] if c['startBeat']==32 and c['endBeat']==224)
    a=round(loop['startSec']*sr);b=round(loop['endSec']*sr);period=b-a
    n=round(duration*sr);y=np.zeros((n,2),np.float32)
    first=min(b,n);y[:first]=x[:first]
    segments=[{'timelineStartSec':0,'sourceStartSec':0,'sourceEndSec':first/sr}]
    cross=round((analysis['beatTimesSec'][32]-analysis['beatTimesSec'][28])*sr)
    joins=[];at=b
    while at<n:
        ramp=(.5-.5*np.cos(np.linspace(0,np.pi,cross))).astype(np.float32)
        # Complementary cosine weights avoid a boost when bar waveforms correlate.
        y[at-cross:at]*=(1-ramp[:,None])
        y[at-cross:at]+=x[a-cross:a]*ramp[:,None]
        # Let the last repetition continue into the original outro when it fits,
        # rather than introducing another repeat during the evidence coda.
        length=(n-at) if n-at<=len(x)-a else min(period,n-at)
        y[at:at+length]=x[a:a+length]
        joins.append({'atSec':at/sr,'startCrossfadeSec':(at-cross)/sr,'crossfadeSec':cross/sr,
            'sourceDepartureSec':b/sr,'sourceReturnSec':a/sr,'beatPhaseMatched':True})
        segments.append({'timelineStartSec':at/sr,'sourceStartSec':a/sr,'sourceEndSec':(a+length)/sr})
        at+=length
    entry=min(round(.9*sr),n);y[:entry]*=np.sin(np.linspace(0,np.pi/2,entry))[:,None]**2
    tail=min(round(5.2*sr),n);y[-tail:]*=np.cos(np.linspace(0,np.pi/2,tail))[:,None]**2
    beats=[];phrases=[]
    for seg in segments:
        for i,t in enumerate(analysis['beatTimesSec']):
            if seg['sourceStartSec']<=t<seg['sourceEndSec']:
                pos=seg['timelineStartSec']+t-seg['sourceStartSec']
                sample=round(t*sr);win=x[max(0,sample-round(.1*sr)):min(len(x),sample+round(.2*sr))]
                beats.append({'timeSec':pos,'frame':round(pos*FPS),'sourceSec':t,'sourceBeatIndex':i,
                    'beatInBar':i%4,'barStart':i%4==0,'phraseStart':i%16==0,
                    'rms':float(np.sqrt(np.mean(win**2)))})
        for phrase in analysis.get('phraseFeatures',[]):
            if seg['sourceStartSec']<=phrase['startSec']<seg['sourceEndSec']:
                start=seg['timelineStartSec']+phrase['startSec']-seg['sourceStartSec']
                end=min(duration,start+phrase['endSec']-phrase['startSec'])
                phrases.append({**phrase,'sourceStartSec':phrase['startSec'],'startSec':start,'endSec':end,
                    'startFrame':round(start*FPS),'endFrame':round(end*FPS)})
    times=[v['timeSec'] for v in beats]
    manifest={'title':MUSIC.stem,'sourcePath':str(MUSIC),'sourceSha256':sha(MUSIC),'durationSec':duration,
        'estimatedBpm':analysis['estimatedBpm'],'loop':loop,'joins':joins,'segments':segments,
        'beatTimesSec':times,'timeStretch':False,'pitchShift':False,'stereoPreserved':True,
        'loopMethod':'Original opening; one 48-bar phrase return at 166.383s to 23.417s with 1-bar complementary cosine crossfade',
        'subjectiveListeningChecked':False,'rights':'User-provided local recording. Publication rights were not independently verified.'}
    path=OUT/'score.wav';sf.write(path,y,sr,subtype='FLOAT');manifest['arrangedSha256']=sha(path)
    save(OUT/'music-arrangement.json',manifest)
    beatdata={'fps':FPS,'durationFrames':round(duration*FPS),'durationSec':duration,'bpm':analysis['estimatedBpm'],
        'beatTimesSec':times,'beats':beats,'phrases':phrases,'joins':joins,'sourceSha256':analysis['sourceSha256'],
        'gridMethod':'librosa detected audio beats; bar/phrase phase is a visualization guide, not a verified musicological transcription'}
    save(ROOT/'src/beats.json',beatdata)
    return path,manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--duration',type=float,default=300);a=p.parse_args()
    path,report=arrange(a.duration);print(json.dumps({'path':str(path),'joins':report['joins'],'durationSec':a.duration},indent=2))
