"""Build a deterministic 48 kHz narration/music master without network/API keys.

The Qwen clips may still be generating. By default missing clips stop the
build; ``--force`` creates a preview with auditable silent gaps.
"""
from __future__ import annotations
from pathlib import Path
import argparse, json, math, subprocess
import numpy as np, soundfile as sf
from scipy.signal import butter, resample_poly, sosfiltfilt

ROOT=Path(__file__).resolve().parents[1]; SR=48000
def db(x): return 20*math.log10(max(float(x),1e-12))
def rms(x): return float(np.sqrt(np.mean(np.square(x),dtype=np.float64)+1e-12))
def mono_resample(x,s):
 x=x.mean(axis=1) if x.ndim>1 else x; x=np.asarray(x,dtype=np.float32)
 if s!=SR:
  g=math.gcd(int(s),SR); x=resample_poly(x,SR//g,s//g).astype(np.float32)
 return x
def clean(x,s):
 x=mono_resample(x,s)
 if len(x)>128: x=sosfiltfilt(butter(4,[75,12000],btype='bandpass',fs=SR,output='sos'),x).astype(np.float32)
 x-=np.mean(x,dtype=np.float64); x*=np.float32(10**((-20-db(rms(x)))/20)); p=np.max(np.abs(x))+1e-9
 if p>.94: x*=np.float32(.94/p)
 f=min(len(x)//8,int(SR*.012))
 if f: x[:f]*=np.linspace(0,1,f,dtype=np.float32); x[-f:]*=np.linspace(1,0,f,dtype=np.float32)
 return x
def fit(x,n):
 u=max(1,n-int(.08*SR))
 if len(x)<=u:return x,1.0
 r=len(x)/u; dst=np.linspace(0,len(x)-1,max(1,int(len(x)/r))); return np.interp(dst,np.arange(len(x)),x).astype(np.float32),r
def loudness(path):
 try:
  p=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-filter_complex','ebur128=framelog=verbose','-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace',check=False); v=[]
  for line in p.stderr.splitlines():
   if 'I:' in line and 'LUFS' in line:
    try:v.append(float(line.split('I:',1)[1].split('LUFS',1)[0]))
    except ValueError:pass
  return {'integratedLufs':v[-1] if v else None}
 except Exception as e:return {'integratedLufs':None,'error':repr(e)}
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--force',action='store_true'); ap.add_argument('--dry-run',action='store_true'); a=ap.parse_args()
 tl=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf8')); fps=int(tl.get('fps',30)); total=int(round(tl['duration']/fps*SR)); raw=ROOT/'public/audio/raw'; ledger_path=ROOT/'research/voice-generation.json'; ledger=json.loads(ledger_path.read_text(encoding='utf8')) if ledger_path.exists() else {}
 voice=np.zeros(total,dtype=np.float32); activity=np.zeros(total,dtype=np.float32); manifest={'sampleRate':SR,'durationSeconds':total/SR,'clips':[],'sourceMusic':'public/music/dna_ambient.wav'}; missing=[]
 for i,c in enumerate(tl['captions']):
  cid=f'{i:03d}'; path=raw/f'{cid}.wav'; start=int(c['start']/fps*SR); end=int(c['end']/fps*SR); row={'id':cid,'startFrame':c['start'],'endFrame':c['end'],'file':path.as_posix()}
  if not path.exists(): missing.append(cid); row['status']='missing'; manifest['clips'].append(row); continue
  try:
   data,s=sf.read(path,dtype='float32'); clip,rate=fit(clean(data,int(s)),end-start); stop=min(total,start+len(clip)); voice[start:stop]+=clip[:stop-start]; activity[max(0,start-int(.18*SR)):min(total,stop+int(.22*SR))]=1; row.update({'status':'ok','rate':rate,'seconds':len(clip)/SR,'text':ledger.get(cid,{}).get('text',c.get('text',''))})
  except Exception as e: missing.append(cid); row.update({'status':'error','error':repr(e)})
  manifest['clips'].append(row)
 manifest['missing']=missing; manifest['used']=len(tl['captions'])-len(missing); plan=ROOT/'research/audio-mix-plan.json'; plan.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
 if missing and not a.force: print(f'Missing {len(missing)} clips; wrote {plan}'); print(', '.join(missing)); return 2
 if a.dry_run: print(json.dumps(manifest,ensure_ascii=False,indent=2)); return 0
 p=np.max(np.abs(voice))+1e-9
 if p>.89: voice*=np.float32(.89/p)
 music_path=ROOT/'public/music/dna_ambient.wav'; music,ms=sf.read(music_path,dtype='float32'); music=mono_resample(music,int(ms));
 if len(music)<total: music=np.tile(music,int(math.ceil(total/len(music))))
 music=music[:total]; music-=np.mean(music,dtype=np.float64); music*=np.float32(10**((-31-db(rms(music)))/20)); k=max(1,int(.12*SR)); env=np.convolve(activity,np.ones(k,dtype=np.float32)/k,mode='same'); music*=(1-.87*np.clip(env,0,1)).astype(np.float32); mix=voice+music; mp=np.max(np.abs(mix))+1e-9
 if mp>.92: mix*=np.float32(.92/mp)
 out=ROOT/'public/audio'; out.mkdir(parents=True,exist_ok=True); sf.write(out/'narration.wav',np.stack([voice,voice],axis=1),SR,subtype='PCM_24'); sf.write(out/'master.wav',np.stack([mix,mix],axis=1),SR,subtype='PCM_24'); manifest.update({'output':(out/'master.wav').as_posix(),'voiceRmsDb':db(rms(voice)),'musicRmsDb':db(rms(music)),'mixRmsDb':db(rms(mix)),'peakDb':db(mp),'loudness':loudness(out/'master.wav')}); (ROOT/'research/audio-mix-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8'); print(f'wrote {out/'master.wav'} {total/SR:.3f}s; clips={manifest['used']} missing={len(missing)}'); return 0
if __name__=='__main__': raise SystemExit(main())
