"""Check the music candidate and save honest A/B gain diagnostics."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,math
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from scipy.signal import resample_poly,correlate
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

WORK=Path(__file__).resolve().parent;ROOT=WORK.parents[2];OUT=WORK/'candidate-01'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf8'))
def main():
 report=read(OUT/'audio-candidate-report.json');tl=read(ROOT/'src/timeline.json');old=read(ROOT/'research/revision-v5/lemon-audio-repair/audio-report.json')
 for p,h in report['lockedProductionInputs'].items():assert sha(ROOT/p)==h
 for p,h in report['hashes'].items():assert sha(OUT/p)==h
 n=report['samples'];sr=48000;block=sr*20;xx=yy=xy=0.;allfinite=True;maxpeak=0.;count=0;expected8=[];actual8=[]
 # Recover a single global mastering gain against the unchanged narration plus
 # candidate music. Zero-lag residual verifies content and timeline continuity.
 with sf.SoundFile(ROOT/'public/narration.wav') as vf,sf.SoundFile(OUT/'music.wav') as mf,sf.SoundFile(OUT/'master.wav') as yf:
  for start in range(0,n,block):
   v=vf.read(min(block,n-start),dtype='float64');m=mf.read(len(v),dtype='float64');y=yf.read(len(v),dtype='float64');x=m+v[:,None]
   assert len(x)==len(y);allfinite=allfinite and np.isfinite(x).all() and np.isfinite(y).all();maxpeak=max(maxpeak,float(np.abs(y).max()));count+=len(y)
   xx+=float(np.sum(x*x));yy+=float(np.sum(y*y));xy+=float(np.sum(x*y))
   expected8.append(resample_poly(np.mean(x,axis=1),1,6));actual8.append(resample_poly(np.mean(y,axis=1),1,6))
 gain=xy/xx;nrms=math.sqrt(max(0,yy-2*gain*xy+gain*gain*xx)/yy);correlation=xy/math.sqrt(xx*yy)
 # The pre-existing narration has high peaks, so loudnorm cannot apply only
 # one linear gain while meeting -15 LUFS/-2 dBTP. Keep that distinction
 # explicit instead of claiming an unperformed sample-identical master.
 assert allfinite and count==n
 expected8=np.concatenate(expected8);actual8=np.concatenate(actual8);lag_checks=[]
 for center in range(800,len(expected8)-800,40000):
  end=min(center+32000,len(expected8)-800);x=expected8[center:end];y=actual8[center-800:end+800]
  if len(x)<4000 or float(x@x)<1e-7:continue
  cross=correlate(y,x,mode='valid',method='fft');power=np.r_[0,np.cumsum(y*y)];den=np.sqrt(np.maximum(1e-20,(power[len(x):]-power[:-len(x)])*float(x@x)))
  normalized=cross/den;best=int(np.argmax(normalized))-800
  lag_checks.append({'startSeconds':center/8000,'bestLagSamples8kHz':best,'correlationAtZero':float(normalized[800]),'bestCorrelation':float(normalized.max())})
 assert lag_checks and all(x['bestLagSamples8kHz']==0 for x in lag_checks),'Master timing shift detected'
 env=np.load(OUT/'control-envelope.npz');times=env['seconds'];newdb=env['targetVoiceOverMusicDB']
 # Faithfully reconstruct the old sentence duck gain (constant RMS multiplier
 # omitted because only gain motion is compared).
 tt=np.arange(math.ceil(n/480)+1)/100;control=np.full(len(tt),10**(-15.8/20));cue=old['targetVoiceOverMusicDBByCue']
 for c in tl['clips']:
  duck=10**(-cue[c.get('musicCue','mechanism')]/20);start=c['startSeconds']-.12;end=c['voiceEndSeconds']+.30
  lo=max(0,math.floor(start*100));hi=min(len(tt),math.ceil((end+1.25)*100));t=tt[lo:hi];rec=np.clip((t-end)/1.25,0,1)
  curve=duck+(10**(-15.8/20)-duck)*(.5-.5*np.cos(np.pi*rec));control[lo:hi]=np.minimum(control[lo:hi],curve)
 control=gaussian_filter1d(control,5);macro=np.zeros(len(tt))
 for i,k in enumerate(old['contentKnots']):
  end=old['contentKnots'][i+1]['beatAlignedTime'] if i+1<len(old['contentKnots']) else n/sr
  selected=(tt>=k['beatAlignedTime'])&(tt<end);macro[selected]=k['gainDb']
 olddb=-20*np.log10(control)-gaussian_filter1d(macro,240)
 oldvel=np.abs(np.diff(olddb))*100;newvel=np.abs(np.diff(newdb))/np.diff(times)
 talk_end=tl['clips'][-1]['voiceEndSeconds'];a=oldvel[tt[:-1]<talk_end];b=newvel[times[:-1]<talk_end]
 diagnostics={'createdUTC':datetime.now(timezone.utc).isoformat(),'candidateMasterSHA256':sha(OUT/'master.wav'),
  'masterFrames':count,'finiteSamples':bool(allfinite),'maxSamplePeak':maxpeak,'globalMasteringGainDB':20*math.log10(gain),
  'reconstructedMixZeroLagCorrelation':correlation,'normalizedResidualAfterGlobalGain':nrms,
  'masteringBehavior':'Dynamic peak control in loudnorm; master is not claimed sample-identical to a globally scaled dry mix.',
  'everyFiveSecondWindowLagSearch':lag_checks,'zeroLagVerified':True,
  'narrationSourceSHA256':report['narrationSHA256'],'narrationTimelineUnchanged':True,
  'gainMotionDuringNarration':{'v6':{'p95DBPerSec':float(np.percentile(a,95)),'maxDBPerSec':float(a.max()),'secondsAbove1DBPerSec':float(np.sum(a>1)/100)},
   'v7':{'p95DBPerSec':float(np.percentile(b,95)),'maxDBPerSec':float(b.max()),'secondsAbove1DBPerSec':float(np.sum(b>1)*.1)}},
  'limitations':['Gain movement measures sidechain control only, not the original piano dynamics.','Numerical comparisons do not establish subjective musical preference.','No full subjective listening performed.'],
  'subjectiveListeningCompleted':False}
 plt.rcParams.update({'font.family':'DejaVu Sans','axes.spines.top':False,'axes.spines.right':False,'font.size':11})
 fig,ax=plt.subplots(2,1,figsize=(14,7),gridspec_kw={'height_ratios':[2,1]},facecolor='#f7f6f2')
 for x in ax:x.set_facecolor('#f7f6f2');x.grid(alpha=.16)
 ax[0].plot(tt,olddb,color='#aaa69c',lw=1,label='V6 sentence-based control');ax[0].plot(times,newdb,color='#277b7b',lw=1.5,label='V7 slow content control')
 ax[0].set(xlabel='Time (s)',ylabel='Voice-over-music control (dB)',title='Same piano performance - smoother background control');ax[0].legend(loc='upper right')
 ax[1].plot(tt[:-1],oldvel,color='#aaa69c',lw=.8);ax[1].plot(times[:-1],newvel,color='#277b7b',lw=1);ax[1].set(xlabel='Time (s)',ylabel='Gain movement (dB/s)',ylim=(0,max(3,float(np.percentile(oldvel,99.8)))))
 fig.tight_layout();fig.savefig(OUT/'gain-control-comparison.png',dpi=160);plt.close(fig)
 diagnostics['gainPlotSHA256']=sha(OUT/'gain-control-comparison.png')
 (OUT/'verification.json').write_text(json.dumps(diagnostics,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps(diagnostics,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
