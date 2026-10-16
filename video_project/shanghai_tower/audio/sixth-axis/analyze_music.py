"""Measured tempo, beat grid and tonal/phrase evidence for the supplied music."""
from pathlib import Path
import json,hashlib,subprocess,datetime
import numpy as np
from scipy import signal
import librosa
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
SOURCE=Path('D:/CloudMusic/John Stanford - The Sixth Axis.mp3')
def save(name,d):(OUT/name).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Loading supplied source',flush=True)
y,sr=librosa.load(SOURCE,sr=22050,mono=True)
hop=512;onsets=librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop)
tempo,beat_frames=librosa.beat.beat_track(onset_envelope=onsets,sr=sr,hop_length=hop,trim=False)
beat_times=librosa.frames_to_time(beat_frames,sr=sr,hop_length=hop)
print('Beat track',float(np.atleast_1d(tempo)[0]),len(beat_times),flush=True)
windows=[]
for start in range(0,int(len(y)/sr)-20,20):
 a=int(start*sr/hop);b=int((start+40)*sr/hop)
 w=onsets[a:b]
 temp=librosa.feature.tempo(onset_envelope=w,sr=sr,hop_length=hop,start_bpm=float(np.atleast_1d(tempo)[0]))
 seg=y[start*sr:min(len(y),(start+20)*sr)]
 windows.append(dict(start_s=start,end_s=min(start+20,len(y)/sr),tempoBPM=float(temp[0]),rmsDBFS=float(20*np.log10(max(np.sqrt(np.mean(seg**2)),1e-12)))))
S=abs(librosa.stft(y,n_fft=4096,hop_length=hop))
harmonic,_=librosa.decompose.hpss(S,kernel_size=31)
chroma=librosa.feature.chroma_stft(S=harmonic**2,sr=sr,hop_length=hop,n_fft=4096,tuning=0)
chroma=chroma/(np.linalg.norm(chroma,axis=0,keepdims=True)+1e-9)
major=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
minor=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
names=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
def key(v):
 scores=[(float(np.corrcoef(v,np.roll(template,k))[0,1]),names[k]+mode) for mode,template in [(' major',major),(' minor',minor)] for k in range(12)]
 return [dict(key=k,correlation=s) for s,k in sorted(scores,reverse=True)[:3]]
for w in windows:
 a=int(w['start_s']*sr/hop);b=int(w['end_s']*sr/hop);w['estimatedKeys']=key(chroma[:,a:b].mean(axis=1))
tonal=key(chroma.mean(axis=1))
# Dynamic beat tracker has local frame jitter: retain measured beats and also a
# robust affine pulse grid fitted to the strong central portion.
index=np.arange(len(beat_times));keep=(beat_times>30)&(beat_times<len(y)/sr-20)
fit=np.polyfit(index[keep],beat_times[keep],1);residual=beat_times-(fit[1]+index*fit[0])
for _ in range(3):
 keep=keep&(abs(residual)<.12)
 fit=np.polyfit(index[keep],beat_times[keep],1);residual=beat_times-(fit[1]+index*fit[0])
grid_bpm=60/fit[0]
onset_times=librosa.times_like(onsets,sr=sr,hop_length=hop)
# Four beat phrase grouping remains an editorial hypothesis until listening.
bar_chroma=[];bar_rms=[]
for i in range(0,len(beat_times)-4,4):
 a,b=beat_times[i],beat_times[i+4];ia,ib=int(a*sr/hop),max(int(b*sr/hop),int(a*sr/hop)+1)
 bar_chroma.append(chroma[:,ia:ib].mean(axis=1).tolist())
 block=y[int(a*sr):int(b*sr)];bar_rms.append(float(np.sqrt(np.mean(block**2))))
metadata=json.loads(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:format_tags=title,artist,album','-of','json',str(SOURCE)],capture_output=True,text=True,encoding='utf8').stdout)
report=dict(source=dict(path=str(SOURCE),sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),bytes=SOURCE.stat().st_size,
 title=metadata['format']['tags'].get('title'),artist=metadata['format']['tags'].get('artist'),album=metadata['format']['tags'].get('album'),
 authorization='User supplied this local track and explicitly selected it to replace the original Douyin reference.',publicationLicenseIndependentlyVerified=False),
 decodedDuration_s=len(y)/sr,sampleRateForAnalysis=sr,measuredTempoBPM=float(np.atleast_1d(tempo)[0]),
 fittedTempoBPM=float(grid_bpm),fittedPulseOffset_s=float(fit[1]),fitBeatCount=int(keep.sum()),
 fitResidualRMS_s=float(np.sqrt(np.mean(residual[keep]**2))),
 beatTimes_s=beat_times.tolist(),beatGridMethod='Librosa onset dynamic beat tracking, then robust affine grid on central onsets.',
 estimatedGlobalKeys=tonal,windows=windows,
 limitations=['Tempo octave and downbeat/meter remain listening-dependent. Four-beat bars are an editorial grouping, not a verified score.',
 'Chroma key correlation is a tonal hint, not a chord transcription. No pitch shift is needed for same-track, matched-chroma joins.',
 'No subjective listening has been certified by this analysis.'],createdUTC=datetime.datetime.now(datetime.timezone.utc).isoformat())
save('analysis.json',report)
np.savez_compressed(OUT/'analysis-features.npz',onsets=onsets,onsetTimes=onset_times,chroma=chroma,chromaTimes=librosa.times_like(chroma,sr=sr,hop_length=hop),
 beatTimes=beat_times,barChroma=np.array(bar_chroma),barRMS=np.array(bar_rms))
print(json.dumps({k:v for k,v in report.items() if k in ['decodedDuration_s','measuredTempoBPM','fittedTempoBPM','fittedPulseOffset_s','fitBeatCount','fitResidualRMS_s','estimatedGlobalKeys','windows']},ensure_ascii=False),flush=True)
