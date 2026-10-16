"""Check calculated cue grid against onsets measured from arranged waveform."""
from pathlib import Path
import json
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
out=work/'pulse-verification.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'research/sixth-axis-pulse-verification.json').write_text(out.read_text('utf8'),encoding='utf8')
print(json.dumps(report,ensure_ascii=False),flush=True)
assert report['acceptedForMotionCueSuggestions']
