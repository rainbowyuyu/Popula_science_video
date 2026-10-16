"""Generate rainbow鱼 narration for the 2026 Nobel medicine short.

The model and reference stay local to D:/python_project/tts. The script records
the exact source sentence, seed and reference hash, then assembles fixed-length
PCM clips matching the Remotion timeline.
"""
from __future__ import annotations
import argparse, hashlib, json, os, subprocess, time
from pathlib import Path
import numpy as np
import soundfile as sf

os.environ['HF_HUB_OFFLINE']='1'; os.environ['TOKENIZERS_PARALLELISM']='false'
ROOT=Path(__file__).resolve().parents[1]; TTS=Path('D:/python_project/tts'); PUB=ROOT/'public/nobel2026'; RAW=PUB/'voice-raw'; FIT=PUB/'voice'; RAW.mkdir(parents=True,exist_ok=True); FIT.mkdir(parents=True,exist_ok=True)
timeline=json.loads((PUB/'timeline.json').read_text(encoding='utf8'))
rows=timeline['clips']; ref=TTS/'work/clone-reference.wav'; refmeta=TTS/'work/clone-reference.json'; ledger=ROOT/'research/nobel2026/voice-generation.json'; ledger.parent.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--generate',action='store_true');parser.add_argument('--assemble',action='store_true');parser.add_argument('--limit',type=int,default=999);args=parser.parse_args()
refhash=hashlib.sha256(ref.read_bytes()).hexdigest(); data=json.loads(ledger.read_text('utf8')) if ledger.exists() else {}

if args.generate:
 import torch
 from qwen_tts import Qwen3TTSModel
 torch.set_num_threads(4)
 model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
 prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=json.loads(refmeta.read_text(encoding='utf8'))['text'])
 params={'temperature':.60,'top_p':.90,'repetition_penalty':1.07,'max_new_tokens':320,'non_streaming_mode':True}
 todo=[]
 for r in rows:
  p=RAW/(r['id']+'.wav'); spec={'text':r['spoken'],'referenceSha256':refhash,'model':'Qwen3-TTS-0.6B','seed':20261005+int(r['id']), 'parameters':params}
  h=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  if data.get(r['id'],{}).get('requestHash')==h and p.exists(): continue
  todo.append((r,p,spec,h))
 print('Voice clips to generate:',len(todo),flush=True)
 for begin in range(0,min(len(todo),args.limit),4):
  batch=todo[begin:begin+4]; torch.manual_seed(batch[0][2]['seed']); start=time.time()
  waves,sr=model.generate_voice_clone(text=[x[0]['spoken'] for x in batch],language='Chinese',voice_clone_prompt=prompt,**params)
  for (r,p,spec,h),wave in zip(batch,waves):
   wave=np.asarray(wave); assert np.isfinite(wave).all(); sf.write(p,wave,sr,subtype='PCM_24')
   data[r['id']]={**spec,'requestHash':h,'file':p.relative_to(ROOT).as_posix(),'seconds':len(wave)/sr,'sampleRate':sr,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'elapsedSeconds':time.time()-start}
   print(r['id'],round(len(wave)/sr,2),'sec',flush=True)
  ledger.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
 print('Voice generation complete')

if args.assemble:
 fixed=[]
 for r in rows:
  src=RAW/(r['id']+'.wav'); out=FIT/(r['id']+'.wav'); target=(r['end']-r['start'])/30
  if not src.exists(): raise FileNotFoundError(src)
  info=sf.info(src); ratio=(info.duration/target)
  # Preserve the cloned voice's natural cadence. The previous assembly
  # stretched short clips to fill every visual window, which made some
  # segments sound unnaturally slow (atempo below 0.60). Allow only a
  # gentle slow-down and pad the remaining visual hold instead.
  ratio=max(.80,min(2.0,ratio)); filt=f'highpass=f=70,lowpass=f=11500,afftdn=nf=-45:nr=2:tn=1,equalizer=f=280:t=q:w=0.8:g=-1.3,acompressor=threshold=0.18:ratio=1.7:attack=16:release=120:makeup=1.05,atempo={ratio:.8f},apad,atrim=duration={target:.6f},afade=t=in:d=0.008,afade=t=out:st={max(0,target-.025):.6f}:d=0.025'
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-af',filt,'-ar','48000','-ac','2','-c:a','pcm_s24le',str(out)],check=True)
  fixed.append(out)
 pieces=[sf.read(p)[0] for p in fixed]; audio=np.concatenate(pieces,axis=0); sf.write(PUB/'master.wav',audio,48000,subtype='PCM_24')
 (PUB/'audio-manifest.json').write_text(json.dumps({'durationSeconds':len(audio)/48000,'sampleRate':48000,'channels':2,'clips':[{'id':r['id'],'start':r['start']/30,'end':r['end']/30,'file':(FIT/(r['id']+'.wav')).relative_to(ROOT).as_posix()} for r in rows]},ensure_ascii=False,indent=2),encoding='utf8')
 print('Assembled',len(audio)/48000,'seconds')

if not args.generate and not args.assemble: parser.print_help()
