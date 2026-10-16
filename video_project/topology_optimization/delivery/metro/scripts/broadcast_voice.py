"""rainbow narration mastering: conservative cleanup with measured delay compensation.

New opt-in module. Does not change existing clean_voice.py callers or reference voice.
"""
from pathlib import Path
import argparse,hashlib,json,tempfile,subprocess
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly,correlate,correlation_lags
PROFILE={'name':'rainbow-narration-v2','highpassHz':65,'lowpassHz':10600,'noiseReductionDb':3,'noiseFloorDb':-55,'adaptiveNoiseTracking':False,'lowMidEqDb':-1.4,'presenceEqDb':.7,'deesserIntensity':.12,'compressionRatio':1.65,'edgeFadeMs':8,'timeStretch':False,'hardGate':False,'targetActiveRmsDb':-21,'maximumClipGainDb':4}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def metrics(w,sr):
 b=int(.02*sr);v=w[:len(w)//b*b].reshape(-1,b);r=np.sqrt(np.mean(v*v,axis=1));active=r>max(.002,r.max()*.06)
 return {'seconds':len(w)/sr,'peakDb':float(20*np.log10(max(np.max(np.abs(w)),1e-9))),'activeRmsDb':float(20*np.log10(max(np.sqrt(np.mean(v[active]**2)),1e-9))),'quietFrameP10Db':float(20*np.log10(max(np.percentile(r,10),1e-9)))}
def master_voice(source,dest,report=None):
 source=Path(source);dest=Path(dest);assert source.resolve()!=dest.resolve()
 raw,sr=sf.read(source,dtype='float64');raw=raw.mean(axis=1) if raw.ndim==2 else raw
 from math import gcd
 g=gcd(sr,48000);w=resample_poly(raw,48000//g,sr//g);sr=48000;w-=np.mean(w)
 before=metrics(w,sr);lp=10600
 filters=f'highpass=f=65,lowpass=f={lp},afftdn=nr=3:nf=-55:tn=0:gs=8,equalizer=f=240:t=q:w=0.8:g=-1.4,equalizer=f=2700:t=q:w=0.8:g=0.7,deesser=i=0.12:m=0.25:f=0.5,acompressor=threshold=0.16:ratio=1.65:attack=18:release=150:knee=2.2:makeup=1'
 with tempfile.TemporaryDirectory(prefix='rainbow-master-') as td:
  a=Path(td)/'input.wav';b=Path(td)/'filtered.wav';sf.write(a,np.pad(w,(0,int(.25*sr))),sr,subtype='FLOAT')
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(a),'-af',filters,'-ar',str(sr),'-ac','1','-c:a','pcm_f32le',str(b)],check=True)
  y,_=sf.read(b,dtype='float64')
 # Measure, do not assume, FFT denoiser or de-esser buffering latency.
 stride=4;c=correlate(y[::stride],w[::stride],mode='full',method='fft');lags=correlation_lags(len(y[::stride]),len(w[::stride]));allowed=(lags>=0)&(lags<=sr*.12/stride)
 delay=int(lags[allowed][np.argmax(c[allowed])]*stride);y=y[delay:delay+len(w)];y=np.pad(y,(0,max(0,len(w)-len(y))))
 after=metrics(y,sr);gain=float(np.clip(PROFILE['targetActiveRmsDb']-after['activeRmsDb'],-4,4));y*=10**(gain/20)
 n=round(.008*sr);ramp=np.sin(np.linspace(0,np.pi/2,n))**2;y[:n]*=ramp;y[-n:]*=ramp[::-1]
 assert np.isfinite(y).all() and np.max(np.abs(y))<.99
 dest.parent.mkdir(parents=True,exist_ok=True);sf.write(dest,y,sr,subtype='PCM_24')
 result={'profile':PROFILE,'inputSha256':sha(source),'outputSha256':sha(dest),'filter':filters,'measuredLatencySamples':delay,'gainDb':gain,'input':before,'output':metrics(y,sr),'preservedLengthSamples':len(y)==len(w),'subjectiveListeningChecked':False}
 if report:Path(report).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('destination');p.add_argument('--report');a=p.parse_args();print(json.dumps(master_voice(a.source,a.destination,a.report),ensure_ascii=False,indent=2))
