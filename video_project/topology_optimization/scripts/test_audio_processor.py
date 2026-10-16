"""Signal checks for length, filter latency and a weak voiced tail."""
from pathlib import Path
import tempfile,sys,json,hashlib
import numpy as np,soundfile as sf
sys.path.insert(0,'D:/python_project/tts')
from broadcast_voice import master_voice
with tempfile.TemporaryDirectory(prefix='rainbow-voice-check-') as td:
 p=Path(td);sr=24000;t=np.arange(sr*2)/sr;w=np.zeros_like(t)
 for start,end,gain in [(.15,.85,.08),(1.2,1.8,.0008)]:
  m=(t>=start)&(t<end);x=t[m]-start;w[m]=gain*(np.sin(2*np.pi*210*x)+.3*np.sin(2*np.pi*1300*x))*np.sin(np.pi*x/(end-start))**2
 sf.write(p/'raw.wav',w,sr,subtype='PCM_24');h=hashlib.sha256((p/'raw.wav').read_bytes()).hexdigest()
 report=master_voice(p/'raw.wav',p/'clean.wav');out,out_sr=sf.read(p/'clean.wav')
 assert out_sr==48000 and len(out)==96000 and report['preservedLengthSamples']
 assert hashlib.sha256((p/'raw.wav').read_bytes()).hexdigest()==h
 assert np.sqrt(np.mean(out[int(1.3*out_sr):int(1.7*out_sr)]**2))>1e-5,'Weak ending was removed'
 assert 0<=report['measuredLatencySamples']<.12*out_sr
 assert np.isfinite(out).all() and np.max(np.abs(out))<.99
 Path(__file__).resolve().parents[1].joinpath('research/v3/audio-processor-test.json').write_text(json.dumps({'passed':True,'checks':['raw immutable','exact sample length after 2x resampling','weak voiced tail survives','measured latency compensated','finite samples and headroom'],'signalReport':report},indent=2),encoding='utf8')
 print('Audio signal checks passed')
