"""Check calculated cue grid against onsets measured from arranged waveform."""
from pathlib import Path
import json,hashlib
import numpy as np
import librosa
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text('utf-8-sig'))
current=read(BASE/'current-arrangement.json');work=Path(current['directory'])
grid=read(work/'beat-grid.json')
y,sr=librosa.load(work/'music-arranged.wav',sr=22050,mono=True)
hop=256
onset=librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop)
_,frames=librosa.beat.beat_track(onset_envelope=onset,sr=sr,hop_length=hop,start_bpm=grid['bpm'],trim=False)
measured=librosa.frames_to_time(frames,sr=sr,hop_length=hop)
period=grid['quarterPulse_s'];offset=grid['offset_s']
index=np.rint((measured-offset)/period)
residual=measured-(offset+index*period)
# Music's opening and ending are deliberately sparse. Compare the stable pulse
# region, reject beat-tracker half-beat slips instead of relabeling the score.
keep=(measured>30)&(measured<len(y)/sr-15)&(np.abs(residual)<period*.25)
assert keep.sum()>400
median=float(np.median(residual[keep]));rms=float(np.sqrt(np.mean(residual[keep]**2)))
p95=float(np.percentile(np.abs(residual[keep]),95))
report=dict(timelineSHA256=current['timelineSHA256'],waveform=str(work/'music-arranged.wav'),
 method='Independent librosa onset beat tracking of final arranged waveform, 256-sample hop at 22050 Hz.',
 comparedBeats=int(keep.sum()),totalDetectedBeats=len(measured),calculatedGridBPM=grid['bpm'],
 medianOffset_s=median,residualRMS_s=rms,absoluteResidualP95_s=p95,
 drift_s_per_minute=float(np.polyfit(measured[keep],residual[keep],1)[0]*60),
 acceptedForMotionCueSuggestions=p95<.05,subjectiveListeningChecked=False,
 limitation='Beat suggestions are onset-checked; four-pulse bar phase is editorial and not a certified musical downbeat.')
strength=onset[np.minimum(frames,len(onset)-1)]
threshold=float(np.percentile(strength[keep],60))
strong=(measured>.25)&(measured<len(y)/sr-4)&(np.abs(residual)<.04)&(strength>=threshold)
stable=np.zeros(len(measured),dtype=bool)
for i in range(len(measured)):
 neighbors=residual[max(0,i-3):min(len(measured),i+4)]
 stable[i]=np.std(neighbors)<.025 and np.max(np.abs(neighbors))<.065
selected=measured[strong&stable]
report['cameraBeatSelection']=dict(method='Measured strong onsets in locally stable beat neighborhoods; no claimed score downbeats.',
 count=len(selected),strengthPercentile=60,maximumGridResidual_s=.04,localResidualStdLimit_s=.025)
timeline=read(ROOT/'public/timeline.json')
timeline_hash=hashlib.sha256((ROOT/'public/timeline.json').read_bytes()).hexdigest()
assert timeline_hash==current['timelineSHA256']
with (ROOT/'public/music.wav').open('rb') as handle:music_hash=hashlib.file_digest(handle,'sha256').hexdigest()
assert music_hash==read(work/'arrangement-report.json')['hashes']['music.wav']
if report['acceptedForMotionCueSuggestions']:
 camera=dict(timelineFrames=timeline['duration'],musicSHA256=music_hash,beats=np.round(selected,6).tolist())
 camera_text=json.dumps(camera,ensure_ascii=False,indent=2)+'\n'
 for dest in [ROOT/'src/camera-beats.json',ROOT/'research/feisheng-camera-beats.json',work/'camera-beats.json']:
  dest.write_text(camera_text,encoding='utf8')
out=work/'pulse-verification.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'research/feisheng-pulse-verification.json').write_text(out.read_text('utf8'),encoding='utf8')
print(json.dumps(report,ensure_ascii=False),flush=True)
assert report['acceptedForMotionCueSuggestions']
