from pathlib import Path
import json,hashlib,subprocess
import numpy as np
import librosa
OUT=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
    matches=list(Path('D:/CloudMusic').glob('*Lemon*mp3'))
    if len(matches)!=1:raise ValueError(matches)
    source=matches[0]
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(source)],text=True,encoding='utf8'))
    y,sr=librosa.load(source,sr=22050,mono=True)
    onset=librosa.onset.onset_strength(y=y,sr=sr,hop_length=256)
    tempo,beats=librosa.beat.beat_track(onset_envelope=onset,sr=sr,hop_length=256,start_bpm=110,trim=True)
    times=librosa.frames_to_time(beats,sr=sr,hop_length=256)
    chroma=librosa.feature.chroma_stft(y=y,sr=sr,n_fft=2048,hop_length=256)
    rms=librosa.feature.rms(y=y,frame_length=2048,hop_length=256)[0]
    np.savez_compressed(OUT/'music-analysis-arrays.npz',onset=onset,chroma=chroma,rms=rms,beatTimes=times)
    # Same relative 4/4-beat phase, long body, compare next 8 beats in normalized chroma.
    best=[]
    for a in range(8,min(80,len(times)-256)):
        for b in range(a+192,len(times)-16,4):
            if times[a]<4 or times[a]>36 or times[b]>len(y)/sr-6:continue
            if (b-a)%4:continue
            aa=np.linspace(times[a],times[a+8],96);bb=np.linspace(times[b],times[b+8],96)
            grid=np.arange(chroma.shape[1])*256/sr
            ca=np.stack([np.interp(aa,grid,c) for c in chroma]);cb=np.stack([np.interp(bb,grid,c) for c in chroma])
            ca/=np.maximum(np.linalg.norm(ca,axis=0),1e-6);cb/=np.maximum(np.linalg.norm(cb,axis=0),1e-6)
            sim=float(np.mean(np.sum(ca*cb,axis=0)))
            long=(times[b]-times[a])/len(y)*sr
            # Reward complete long-body loops but retain harmonic similarity priority.
            score=sim+.08*long
            best.append(dict(fromBeat=a,toBeat=b,fromSeconds=float(times[a]),toSeconds=float(times[b]),
                             beatCount=b-a,duration=float(times[b]-times[a]),chromaCosine=sim,score=score))
    best.sort(key=lambda v:v['score'],reverse=True)
    result=dict(source=str(source),sourceSHA256=sha(source),durationSeconds=len(y)/sr,probe=probe,
                estimatedBpm=float(np.asarray(tempo).reshape(-1)[0]),beatCount=len(times),beatTimes=times.tolist(),
                bpmMethod='librosa onset envelope and dynamic-programming beat_track; estimated, not a manually verified score',
                loopCandidates=best[:20],listeningCompleted=False)
    (OUT/'music-analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({k:result[k] for k in ['source','sourceSHA256','durationSeconds','estimatedBpm','beatCount','loopCandidates']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
