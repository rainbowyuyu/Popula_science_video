"""Read-only beat/phrase candidates from the user-selected track."""
import subprocess
import numpy as np
import soundfile as sf
from audio_common import ROOT,OUT,MUSIC,SR,sha,save,measure

def main():
    import librosa
    OUT.mkdir(parents=True,exist_ok=True);dest=OUT/'music-source.wav'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(MUSIC),'-ar',str(SR),'-ac','2','-c:a','pcm_f32le',str(dest)],check=True)
    y,sr=librosa.load(str(dest),sr=22050,mono=True)
    tempo,beats=librosa.beat.beat_track(y=y,sr=sr,hop_length=256,trim=False)
    ts=librosa.frames_to_time(beats,sr=sr,hop_length=256);bpm=float(np.asarray(tempo).reshape(-1)[0])
    # Similarity across 8-bar stereo-independent chroma and onset windows.
    chroma=librosa.feature.chroma_stft(y=y,sr=sr,hop_length=256)
    rms=librosa.feature.rms(y=y,hop_length=256)[0]
    onset=librosa.onset.onset_strength(y=y,sr=sr,hop_length=256)
    candidates=[]
    for ia in range(8,min(64,len(ts)),4):
        for bars in (24,32,40,48):
            ib=ia+bars*4
            if ib+8>=len(ts):continue
            a,b=int(beats[ia]),int(beats[ib]);width=int(np.median(np.diff(beats))*4)
            if b+width>=chroma.shape[1]:continue
            ca,cb=chroma[:,a:a+width],chroma[:,b:b+width]
            cs=float(np.sum(ca*cb)/max(1e-9,np.linalg.norm(ca)*np.linalg.norm(cb)))
            ra=float(np.mean(rms[a:a+width]));rb=float(np.mean(rms[b:b+width]))
            loud=abs(20*np.log10(max(ra,1e-6)/max(rb,1e-6)))
            score=cs-.035*loud
            candidates.append({'startBeat':ia,'endBeat':ib,'bars':bars,'startSec':float(ts[ia]),'endSec':float(ts[ib]),
                 'lengthSec':float(ts[ib]-ts[ia]),'chromaSimilarity':cs,'rmsDifferenceDb':loud,'score':score})
    candidates.sort(key=lambda v:v['score'],reverse=True)
    report={'sourcePath':str(MUSIC),'sourceSha256':sha(MUSIC),'decodedSha256':sha(dest),'durationSec':len(y)/sr,
        'sampleRate':SR,'channels':2,'estimatedBpm':bpm,'beatTimesSec':ts.tolist(),'phraseCandidates':candidates[:20],
        'method':'librosa beat tracking plus bar-length chroma/RMS boundary comparison; computational candidate, not auditory approval',
        'loudness':measure(dest),'rights':'User-specified local recording; distribution permission not independently verified',
        'subjectiveListeningChecked':False}
    save(ROOT/'research/audio-music-analysis.json',report)
    print({k:report[k] for k in ('durationSec','estimatedBpm','phraseCandidates','loudness')},flush=True)

if __name__=='__main__':main()
