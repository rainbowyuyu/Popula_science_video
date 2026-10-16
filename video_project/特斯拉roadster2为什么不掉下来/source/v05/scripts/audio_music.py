"""User-selected music: measured-beat loop, conservative speech-space processing."""
from pathlib import Path
import json,subprocess
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfilt
from scipy.ndimage import gaussian_filter1d
from audio_common import ROOT,OUT,SR,save,sha,measure

SOURCE=Path('D:/CloudMusic/电台节目/绿豆腐炒肉 - 莫问归期+辞九门回忆dj.mp3')

def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    analysis=json.loads((OUT/'music-analysis.json').read_text(encoding='utf8'))
    duration=narr['durationSec'];count=narr['durationFrames']*(SR//30)
    sourcewav=OUT/'music-source-decoded.wav'
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(SOURCE),'-vn','-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(sourcewav)],check=True)
    source,sr=sf.read(sourcewav,dtype='float32');beats=np.array(analysis['beatTimes'])
    # Beat 436 joins beat 180 over eight measured beats; both intervals are
    # 3.784853s. 256-beat distance preserves phrase phase, with chroma similarity
    # 0.952. Avoid the slightly stronger candidate whose join is too early.
    candidate=next(c for c in analysis['loopCandidates'] if c['sourceStartBeat']==180 and c['sourceEndBeat']==436)
    end=candidate['sourceEndSec'];start=candidate['sourceStartSec'];overlap=candidate['outgoing8BeatsSec']
    fade_count=round(overlap*SR);first_count=min(count,round(end*SR));output=np.zeros((count,2),np.float32)
    output[:first_count]=source[:first_count];mapping=[{'outputStartSec':0,'outputEndSec':first_count/SR,'sourceStartSec':0,'sourceEndSec':first_count/SR,'type':'original continuous opening'}]
    cursor=first_count
    while cursor<count:
        join=cursor-fade_count;incoming=source[round(start*SR):round(end*SR)];needed=min(len(incoming),count-join);incoming=incoming[:needed]
        fade=min(fade_count,needed);u=np.linspace(0,1,fade,dtype=np.float32)
        # Equal-gain cosine overlap avoids the loudness bump of correlated
        # kick drums that an equal-power crossfade can produce.
        w=(.5-.5*np.cos(np.pi*u))[:,None]
        output[join:join+fade]=output[join:join+fade]*(1-w)+incoming[:fade]*w
        output[join+fade:join+needed]=incoming[fade:]
        mapping.append({'outputStartSec':join/SR,'outputEndSec':(join+needed)/SR,'sourceStartSec':start,'sourceEndSec':start+needed/SR,'type':'beat-aligned repeat','crossfadeSec':fade/SR})
        cursor=join+needed
    # Keep the original bass and rhythm; gently reduce centred vocal presence.
    mid=(output[:,0]+output[:,1])*.5;side=(output[:,0]-output[:,1])*.5
    speech_band=sosfilt(butter(2,[650,3800],btype='bandpass',fs=SR,output='sos'),mid)
    mid=mid+(10**(-3.5/20)-1)*speech_band
    output[:,0]=mid+side;output[:,1]=mid-side
    # Stage-level musical dynamics; ducking is separately driven by full phrases.
    control_sr=100;ncontrol=int(np.ceil(duration*control_sr))+1;level=np.zeros(ncontrol,np.float32)
    strengths={'hook':1.1,'suction':-.5,'ceiling':-1.0,'release':.4,'thrust':.8,'roll':1.0,'control':-.8,'limits':-1.3,'recap':.7}
    for group in narr['groups']:
        a=int(group['startSec']*control_sr);b=min(ncontrol,int(group['endSec']*control_sr));level[a:b]=strengths.get(group['id'],0)
    level=gaussian_filter1d(level,70);envelope=10**(np.interp(np.arange(count)/SR,np.arange(ncontrol)/control_sr,level)/20)
    output*=envelope[:,None]
    fadein=round(.18*SR);fadeout=round(4.0*SR);output[:fadein]*=np.linspace(0,1,fadein)[:,None];output[-fadeout:]*=(np.cos(np.linspace(0,np.pi/2,fadeout))**2)[:,None]
    premix=OUT/'music-arranged.wav';sf.write(premix,output,SR,subtype='PCM_24')
    dest=ROOT/'public/audio';dest.mkdir(parents=True,exist_ok=True);score=dest/'score.wav'
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(premix),'-af','highpass=f=32,equalizer=f=2800:t=q:w=0.9:g=-2.5,loudnorm=I=-24:TP=-3:LRA=8','-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(score)],check=True)
    audio,sr=sf.read(score,dtype='float32');assert len(audio)==count
    output_beats=[]
    for m in mapping:
        for i,b in enumerate(beats):
            t=b-m['sourceStartSec']+m['outputStartSec']
            if m['outputStartSec']<=t<m['outputEndSec']:
                if output_beats and abs(output_beats[-1]['timeSec']-t)<.08:continue
                output_beats.append({'timeSec':round(float(t),6),'sourceBeat':i,'barCandidate':i%4==0})
    output_beats.sort(key=lambda x:x['timeSec']);filtered=[]
    for beat in output_beats:
        if not filtered or abs(filtered[-1]['timeSec']-beat['timeSec'])>.08:filtered.append(beat)
    transitions=[]
    for group in narr['groups']:
        closest=min(filtered,key=lambda b:abs(b['timeSec']-group['startSec']))
        transitions.append({'scene':group['id'],'narrationStartSec':group['startSec'],'nearestBeatSec':closest['timeSec'],'offsetSec':round(closest['timeSec']-group['startSec'],6),'note':'visual accent may use this beat; narration timing stays unchanged'})
    save(OUT/'music-edit-map.json',{'source':str(SOURCE),'sourceSha256':sha(SOURCE),'tempoBpmMeasured':analysis['tempoBpm'],'timeStretch':False,'mapping':mapping,'beats':filtered,'sceneAccents':transitions})
    save(OUT/'score-ledger.json',{'title':SOURCE.stem,'sourceFile':str(SOURCE),'sourceSha256':sha(SOURCE),'usage':'User supplied local music. Rights remain with original rights holders; no commercial permission asserted.','originalComposition':False,'durationSec':duration,'sampleRate':SR,'sha256':sha(score),'sourceScript':Path(__file__).relative_to(ROOT).as_posix(),'scriptSha256':sha(__file__),'beatAnalysis':'librosa onset + beat track; bar phase is a candidate, not manually confirmed','loopSelection':candidate,'crossfade':'8 measured beats, complementary cosine gains','processing':{'midVocalBandReductionDb':3.5,'midBandHz':[650,3800],'presenceDipDb':2.5,'presenceHz':2800,'tempoChange':False,'pitchChange':False,'finalFadeSec':4},'loudness':measure(score),'subjectiveListeningChecked':False})
    save(OUT/'music-provenance.json',{'title':SOURCE.stem,'sourceFile':str(SOURCE),'sourceSha256':sha(SOURCE),'selectedBy':'explicit user instruction for V05','rights':'Copyright remains with original rights holders. Local user-supplied file; commercial license not established.','output':'public/audio/score.wav','outputSha256':sha(score),'sourceDurationSec':len(source)/SR,'outputDurationSec':duration,'tempoBpmMeasured':analysis['tempoBpm'],'timeStretch':False,'pitchShift':False,'sourceTimelineMap':mapping,'details':'work/audio/score-ledger.json','beatMap':'work/audio/music-edit-map.json'})
    print(json.dumps({'duration':duration,'score':str(score),'sourceDuration':len(source)/SR,'bpm':analysis['tempoBpm'],'mapping':mapping,'sceneAccents':transitions},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
