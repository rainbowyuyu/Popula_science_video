"""After picture render, verify its actual AAC against the V16 master."""
from pathlib import Path
import argparse,hashlib,json,math,re,subprocess
import numpy as np
import soundfile as sf
from scipy.signal import correlate,correlation_lags
ROOT=Path(__file__).resolve().parents[3]
ap=argparse.ArgumentParser();ap.add_argument('--video',required=True,type=Path)
ap.add_argument('--vertical',action='store_true');ap.add_argument('--out',required=True,type=Path)
a=ap.parse_args();video=a.video.resolve(strict=True);out=a.out.resolve();out.mkdir(parents=True,exist_ok=True)
prefix='vertical-' if a.vertical else '';master=ROOT/'public/v16/audio'/(prefix+'master.wav')
sr=48000;expected=90 if a.vertical else 360
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
p=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)],check=True,capture_output=True,text=True)
meta=json.loads(p.stdout);streams=[s for s in meta['streams'] if s['codec_type']=='audio']
assert len(streams)==1 and streams[0]['codec_name']=='aac'
assert streams[0]['sample_rate']=='48000' and streams[0]['channels']==2
assert abs(float(streams[0]['duration'])-expected)<.1
decoded=out/'decoded-final-audio.wav'
subprocess.run(['ffmpeg','-v','error','-y','-i',str(video),'-vn','-ar',str(sr),'-ac','2','-c:a','pcm_s24le',str(decoded)],check=True)
ref,rs=sf.read(master,dtype='float32',always_2d=True);wave,ws=sf.read(decoded,dtype='float32',always_2d=True)
assert rs==ws==sr and len(ref)==expected*sr and abs(len(wave)-len(ref))<.1*sr
count=min(12*sr,len(wave));x=ref[:count].mean(axis=1);y=wave[:count].mean(axis=1)
c=correlate(y[::4],x[::4],method='fft');lags=correlation_lags(len(y[::4]),len(x[::4]));mask=np.abs(lags)<=512
coarse=int(lags[mask][np.argmax(c[mask])])*4
def aligned(x,y,lag):
    aa=max(0,-lag);bb=max(0,lag);n=min(len(x)-aa,len(y)-bb);return x[aa:aa+n],y[bb:bb+n]
scores=[]
for lag in range(coarse-4,coarse+5):
    xx,yy=aligned(x,y,lag);scores.append((float(np.dot(xx.astype(np.float64),yy.astype(np.float64))),lag))
lag=max(scores)[1];assert abs(lag)<=2048
ref,wave=aligned(ref,wave,lag)
windows=[]
for at in [0,expected*.25,expected*.5,expected*.75,expected-4.5]:
    aa=round(at*sr);bb=min(len(ref),aa+round(min(10,expected-at-.6)*sr))
    xx=ref[aa:bb].astype(np.float64);yy=wave[aa:bb].astype(np.float64)
    corr=float(np.sum(xx*yy)/math.sqrt(float(np.sum(xx*xx))*float(np.sum(yy*yy))))
    rel=math.sqrt(float(np.sum((xx-yy)**2))/float(np.sum(xx*xx)))
    assert corr>.98 and rel<.15,(at,corr,rel)
    windows.append(dict(startSeconds=at,endSeconds=bb/sr,correlation=corr,relativeRMS=rel))
p=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(video),'-af','loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
level=json.loads(re.search(r'\{\s*"input_i"[\s\S]*?\}',p.stderr).group())
assert -16<=float(level['input_i'])<=-14 and float(level['input_tp'])<=-1,level
report=dict(passed=True,video=str(video),videoSHA256=sha(video),master=str(master),masterSHA256=sha(master),
    durationSeconds=expected,codec='aac',sampleRate=sr,channels=2,encoderAlignmentSamples=lag,windows=windows,
    measuredAAC=level,subjectiveListeningChecked=False,scope='Actual video AAC decoded and matched to new V16 master, including references music tail.')
(out/'audio-wave-match.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(dict(passed=True,lufs=level['input_i'],truePeak=level['input_tp'],report=str(out/'audio-wave-match.json'))),flush=True)
