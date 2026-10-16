"""Build sidecar audio for the compact storyboard without touching master.wav.

This uses the already ASR-checked public/voice takes referenced by
src/beso-story-compact.json.  It intentionally writes compact-120-* files so
the 5:33 delivery stays immutable.
"""
from pathlib import Path
import hashlib, json, subprocess
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from score import compose

R=Path(__file__).resolve().parents[1]
FPS=60
SR=48000

def sha(p:Path):
    h=hashlib.sha256()
    with p.open('rb') as f:
        while b:=f.read(2**20): h.update(b)
    return h.hexdigest()

def main():
    story=json.loads((R/'src/beso-story-compact.json').read_text('utf8'))
    seconds=story['duration']/story['fps']; n=round(seconds*SR)
    voice=np.zeros((n,2),np.float32); activity=np.zeros(n,np.float32)
    placements=[]
    for scene in story['scenes']:
        for clip in scene['clips']:
            src=R/'public'/clip['file']
            if not src.exists(): raise FileNotFoundError(src)
            x,sr=sf.read(src,always_2d=True,dtype='float32')
            if sr!=SR: raise RuntimeError(f'{src}: expected {SR} Hz, got {sr}')
            mono=x.mean(axis=1); block=960
            usable=mono[:len(mono)//block*block]
            if len(usable)==0: raise RuntimeError(f'empty take: {src}')
            rms=np.sqrt(np.mean(usable.reshape(-1,block)**2,axis=1))
            mask=np.repeat(rms>max(.002,float(rms.max())*.06),block)
            active=mono[:len(mask)][mask]
            gain=min(10**(-20/20)/max(float(np.sqrt(np.mean(active**2))),1e-8), .69/max(float(np.abs(mono).max()),1e-8))
            y=np.repeat(mono[:,None],2,axis=1)*gain
            at=round((scene['start']+clip['from'])/FPS*SR)
            count=min(len(y),n-at)
            if at<0 or count<=0: raise RuntimeError(f'clip outside compact duration: {clip["id"]}')
            voice[at:at+count]+=y[:count]
            activity[max(0,at-4800):min(n,at+count+12000)]=1
            placements.append({'id':clip['id'],'file':clip['file'],'startFrame':scene['start']+clip['from'],'frames':clip['frames'],'sha256':sha(src)})
    audio=R/'public/audio'; audio.mkdir(exist_ok=True)
    narration=audio/'compact-120-narration.wav'; sf.write(narration,voice,SR,subtype='PCM_24')
    music=compose(seconds)
    music*=10**(-31/20)/max(float(np.sqrt(np.mean(music**2))),1e-9)
    envelope=gaussian_filter1d(activity[::480],sigma=35)
    envelope=np.interp(np.arange(n),np.arange(len(envelope))*480,envelope)
    music*=np.power(10,(-7*envelope)/20)[:,None]
    musicPath=audio/'compact-120-music.wav'; sf.write(musicPath,music,SR,subtype='PCM_24')
    premaster=audio/'compact-120-premaster.wav'; sf.write(premaster,voice+music,SR,subtype='FLOAT')
    # Two-pass normalization, sidecar only.
    first=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(premaster),'-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    (R/'research/qa/compact-audio-loudness-first.log').write_text(first.stderr,'utf8')
    stats=json.loads(first.stderr[first.stderr.rfind('{'):first.stderr.rfind('}')+1])
    filt=f"loudnorm=I=-16:TP=-1.5:LRA=8:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true:print_format=json"
    master=audio/'compact-120-master.wav'
    subprocess.run(['ffmpeg','-v','info','-y','-i',str(premaster),'-af',filt,'-ar',str(SR),'-c:a','pcm_s24le',str(master)],capture_output=True,text=True,check=True)
    mixed,_=sf.read(master,dtype='float32',always_2d=True)
    mask=activity>.5; vd=20*np.log10(max(np.sqrt(np.mean(voice[mask]**2)),1e-9)); md=20*np.log10(max(np.sqrt(np.mean(music[mask]**2)),1e-9))
    report={'story':'src/beso-story-compact.json','seconds':seconds,'frames':story['duration'],'sampleRate':SR,'clips':len(placements),'speechOverMusicDb':float(vd-md),'master':str(master.relative_to(R)),'masterSHA256':sha(master),'peak':float(np.abs(mixed).max()),'loudnessFirstPass':stats,'subjectiveListeningChecked':False,'placements':placements}
    (R/'research/qa/compact-audio.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps({k:report[k] for k in ('seconds','frames','clips','speechOverMusicDb','masterSHA256')},ensure_ascii=False))

if __name__=='__main__': main()
