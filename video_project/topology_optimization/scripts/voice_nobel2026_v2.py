"""Generate natural-paced Qwen3-TTS narration for NobelMedicine2026V2.
The same subtitle field feeds speech and on-screen captions. No forced slow-down;
short sentence tails remain as intentional visual breathing room.
"""
from __future__ import annotations
import argparse, hashlib, json, os, subprocess, time
from pathlib import Path
import numpy as np, soundfile as sf

os.environ['HF_HUB_OFFLINE']='1'; os.environ['TOKENIZERS_PARALLELISM']='false'
ROOT=Path(__file__).resolve().parents[1]; TTS=Path('D:/python_project/tts'); PUB=ROOT/'public/nobel2026'; RAW=PUB/'voice-v2-raw'; CLEAN=PUB/'voice-v2'; RAW.mkdir(exist_ok=True,parents=True); CLEAN.mkdir(exist_ok=True,parents=True)
timeline=json.loads((ROOT/'src/nobel2026/timeline-v2.json').read_text(encoding='utf8')); rows=timeline['clips']; ref=TTS/'work/clone-reference.wav'; refmeta=TTS/'work/clone-reference.json'; ledger=ROOT/'research/nobel2026/voice-generation-v2.json'; ledger.parent.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--generate',action='store_true');parser.add_argument('--assemble',action='store_true');parser.add_argument('--limit',type=int,default=999);args=parser.parse_args()
data=json.loads(ledger.read_text(encoding='utf8')) if ledger.exists() else {}; refhash=hashlib.sha256(ref.read_bytes()).hexdigest()
if args.generate:
 import torch
 from qwen_tts import Qwen3TTSModel
 torch.set_num_threads(4)
 model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
 prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=json.loads(refmeta.read_text(encoding='utf8'))['text'])
 params={'temperature':.68,'top_p':.92,'repetition_penalty':1.05,'max_new_tokens':320,'non_streaming_mode':True}
 todo=[]
 for r in rows:
  p=RAW/f"{r['id']}.wav"; spec={'text':r['spoken'],'referenceSha256':refhash,'model':'Qwen3-TTS-0.6B','seed':20261006+int(r['id']),'parameters':params}; h=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  if data.get(r['id'],{}).get('requestHash')==h and p.exists(): continue
  todo.append((r,p,spec,h))
 print('clips to generate',len(todo),flush=True)
 for begin in range(0,min(len(todo),args.limit),3):
  batch=todo[begin:begin+3]; torch.manual_seed(batch[0][2]['seed']); t0=time.time(); waves,sr=model.generate_voice_clone(text=[x[0]['spoken'] for x in batch],language='Chinese',voice_clone_prompt=prompt,**params)
  for (r,p,spec,h),wave in zip(batch,waves):
   wave=np.asarray(wave); assert np.isfinite(wave).all(); sf.write(p,wave,sr,subtype='PCM_24'); data[r['id']]={**spec,'requestHash':h,'file':p.relative_to(ROOT).as_posix(),'seconds':len(wave)/sr,'sampleRate':sr,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'elapsedSeconds':time.time()-t0}; print(r['id'],round(len(wave)/sr,2),'s',flush=True)
  ledger.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
if args.assemble:
 parts=[]; manifest=[]
 for r in rows:
  src=RAW/f"{r['id']}.wav"; out=CLEAN/f"{r['id']}.wav"; target=(r['end']-r['start'])/30
  if not src.exists(): raise FileNotFoundError(src)
  info=sf.info(src); dur=info.duration; ratio=dur/target
  # Preserve timbre. Only a very small correction is allowed when a clip overruns.
  atempo=min(1.05,max(.95,ratio))
  af=f'highpass=f=70,lowpass=f=11500,afftdn=nf=-48:nr=1.5:tn=1,equalizer=f=280:t=q:w=0.8:g=-1.0,acompressor=threshold=0.16:ratio=1.5:attack=16:release=120:makeup=1.02,atempo={atempo:.6f},apad,atrim=duration={target:.6f},afade=t=in:d=0.012,afade=t=out:st={max(.02,target-.05):.6f}:d=0.04'
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-af',af,'-ar','48000','-ac','2','-c:a','pcm_s24le',str(out)],check=True)
  parts.append(sf.read(out,dtype='float32')[0]); manifest.append({'id':r['id'],'start':r['start']/30,'end':r['end']/30,'source':str(src.relative_to(ROOT)),'processed':str(out.relative_to(ROOT)),'sourceSeconds':dur,'targetSeconds':target,'atempo':atempo})
 audio=np.concatenate(parts,axis=0)
 # Keep the fifteen-second evidence coda inside the same master timeline.
 total_frames=timeline['duration']*48000//timeline['fps']
 if len(audio)<total_frames:
  audio=np.concatenate([audio,np.zeros((total_frames-len(audio),audio.shape[1]),dtype=audio.dtype)])
 sf.write(PUB/'master-v2.wav',audio,48000,subtype='PCM_24');
 (PUB/'audio-manifest-v2.json').write_text(json.dumps({'version':'v2','durationSeconds':len(audio)/48000,'sampleRate':48000,'channels':2,'clips':manifest},ensure_ascii=False,indent=2),encoding='utf8'); print('assembled',len(audio)/48000,'seconds')
if not args.generate and not args.assemble: parser.print_help()
