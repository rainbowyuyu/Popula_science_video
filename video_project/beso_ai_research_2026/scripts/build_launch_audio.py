"""Build the 105-second launch-film sidecar audio.

The launch plan has a new visual structure but no new voice takes. This script
places existing ASR-checked takes on the plan's scene anchors, then composes
the existing score for exactly 105 seconds. It never writes the 5:33 master.
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

# plan scene -> source voice IDs. These are all present in public/voice and
# carry the same SHA256 values as the verified story. Keep gaps for camera/UI.
MAP={
    'hero':['hook-0'],
    'brief':['brief-1'],
    'topology':['beso-0','beso-4'],
    'physics':['zwind-0','zwind-2'],
    'interaction':['brief-3'],
    'toolchain':['rebuild-3'],
    'proof':['compare-1','compare-3'],
    'close':['close-2'],
}

def sha(p:Path):
    h=hashlib.sha256()
    with p.open('rb') as f:
        while b:=f.read(2**20): h.update(b)
    return h.hexdigest()

def main():
    plan=json.loads((R/'research/launch-film-105s-plan.json').read_text('utf8'))
    assert plan['fps']==FPS and plan['durationSeconds']==105
    scenes={s['id']:s for s in plan['scenes']}
    n=round(plan['durationSeconds']*SR)
    voice=np.zeros((n,2),np.float32); activity=np.zeros(n,np.float32)
    placements=[]
    for sid,ids in MAP.items():
        if sid not in scenes: raise KeyError(sid)
        s=scenes[sid]; local=0.05 if sid=='proof' else 0.25 # camera has a short headroom beat
        for vid in ids:
            src=R/'public/voice'/f'{vid}.wav'
            if not src.exists(): raise FileNotFoundError(src)
            x,sr=sf.read(src,always_2d=True,dtype='float32')
            if sr!=SR: raise RuntimeError(f'{src}: expected {SR} Hz, got {sr}')
            mono=x.mean(axis=1); block=960; usable=mono[:len(mono)//block*block]
            rms=np.sqrt(np.mean(usable.reshape(-1,block)**2,axis=1))
            mask=np.repeat(rms>max(.002,float(rms.max())*.06),block)
            active=mono[:len(mask)][mask]
            gain=min(10**(-20/20)/max(float(np.sqrt(np.mean(active**2))),1e-8), .69/max(float(np.abs(mono).max()),1e-8))
            y=np.repeat(mono[:,None],2,axis=1)*gain
            startSec=s['from']+local; at=round(startSec*SR); count=min(len(y),n-at)
            if at<0 or count<=0 or startSec+count/SR>s['to']+0.25:
                raise RuntimeError(f'{vid} does not fit {sid}: {startSec:.3f}s, {count/SR:.3f}s')
            voice[at:at+count]+=y[:count]
            activity[max(0,at-4800):min(n,at+count+12000)]=1
            placements.append({'scene':sid,'sceneWindow':[s['from'],s['to']],'sourceClip':vid,'file':f'voice/{vid}.wav','startSeconds':startSec,'startFrame':round(startSec*FPS),'durationSeconds':len(y)/SR,'frames':round(len(y)/SR*FPS),'sha256':sha(src)})
            local+=len(y)/SR+(0.0 if sid=='proof' else 0.18)
    audio=R/'public/audio';audio.mkdir(exist_ok=True)
    narration=audio/'launch-105-narration.wav';sf.write(narration,voice,SR,subtype='PCM_24')
    music=compose(105.0);music*=10**(-31/20)/max(float(np.sqrt(np.mean(music**2))),1e-9)
    envelope=gaussian_filter1d(activity[::480],sigma=35); envelope=np.interp(np.arange(n),np.arange(len(envelope))*480,envelope)
    music*=np.power(10,(-7*envelope)/20)[:,None]
    musicPath=audio/'launch-105-music.wav';sf.write(musicPath,music,SR,subtype='PCM_24')
    premaster=audio/'launch-105-premaster.wav';sf.write(premaster,voice+music,SR,subtype='FLOAT')
    first=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(premaster),'-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    (R/'research/qa/launch-105-loudness-first.log').write_text(first.stderr,'utf8')
    stats=json.loads(first.stderr[first.stderr.rfind('{'):first.stderr.rfind('}')+1])
    filt=f"loudnorm=I=-16:TP=-1.5:LRA=8:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true:print_format=json"
    master=audio/'launch-105-master.wav'
    subprocess.run(['ffmpeg','-v','info','-y','-i',str(premaster),'-af',filt,'-ar',str(SR),'-c:a','pcm_s24le',str(master)],capture_output=True,text=True,check=True)
    mixed,_=sf.read(master,dtype='float32',always_2d=True);mask=activity>.5
    vd=20*np.log10(max(np.sqrt(np.mean(voice[mask]**2)),1e-9));md=20*np.log10(max(np.sqrt(np.mean(music[mask]**2)),1e-9))
    report={'plan':'research/launch-film-105s-plan.json','seconds':105.0,'frames':6300,'sampleRate':SR,'voiceClips':len(placements),'speechOverMusicDb':float(vd-md),'master':'public/audio/launch-105-master.wav','masterSHA256':sha(master),'peak':float(np.abs(mixed).max()),'loudnessFirstPass':stats,'subjectiveListeningChecked':False,'placements':placements}
    (R/'research/qa/launch-105-audio.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps({k:report[k] for k in ('seconds','frames','voiceClips','speechOverMusicDb','masterSHA256')},ensure_ascii=False))

if __name__=='__main__':main()
