"""Bounded, cached personal Qwen narration; raw sources remain unmodified."""
from pathlib import Path
import os,json,hashlib,argparse,time
os.environ.setdefault('HF_HUB_OFFLINE','1')
os.environ.setdefault('TOKENIZERS_PARALLELISM','false')
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
V3=Path(__file__).resolve().parents[1]
TTS=Path('D:/python_project/tts')
RAW=V3/'public/audio/raw';RAW.mkdir(parents=True,exist_ok=True)
LEDGER=V3/'research/voice-generation.json'
PARAMS={'temperature':.55,'top_p':.9,'repetition_penalty':1.08,'max_new_tokens':750,'non_streaming_mode':True}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--ids',default='');p.add_argument('--device',default='cuda:0');p.add_argument('--threads',type=int,default=4);a=p.parse_args()
 script=json.loads((V3/'src/narration.json').read_text(encoding='utf8'))
 ledger=json.loads(LEDGER.read_text(encoding='utf8')) if LEDGER.exists() else {}
 ids=set(a.ids.split(',')) if a.ids else None
 ref=TTS/'work/clone-reference.wav';refmeta=TTS/'work/clone-reference.json'
 todo=[]
 for i,cue in enumerate(script['cues']):
  if ids and cue['id'] not in ids:continue
  spec={'text':cue['spokenText'],'referenceSha256':sha(ref),'model':'Qwen3-TTS-0.6B','seed':2026101100+i,'parameters':PARAMS}
  key=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  dest=RAW/f"{cue['id']}.wav"
  if ledger.get(cue['id'],{}).get('requestHash')==key and dest.exists():continue
  todo.append((cue,spec,key,dest))
 if not todo:print('All raw clips cached',flush=True);return
 torch.set_num_threads(a.threads)
 clock=time.perf_counter()
 model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map=a.device,dtype=torch.float32 if a.device=='cpu' else torch.bfloat16,attn_implementation='sdpa')
 prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=json.loads(refmeta.read_text(encoding='utf8'))['text'])
 for cue,spec,key,dest in todo:
  clip_clock=time.perf_counter()
  torch.manual_seed(spec['seed'])
  waves,sr=model.generate_voice_clone(text=[spec['text']],language='Chinese',voice_clone_prompt=prompt,**PARAMS)
  x=np.asarray(waves[0],dtype=np.float32)
  if not np.isfinite(x).all():raise RuntimeError('nonfinite')
  sf.write(dest,x,sr,subtype='PCM_24')
  ledger[cue['id']]={**spec,'displayText':cue['text'],'requestHash':key,'rawDurationSec':len(x)/sr,'sampleRate':sr,'file':dest.relative_to(V3).as_posix(),'sha256':sha(dest),'device':a.device,'wallSeconds':time.perf_counter()-clip_clock,'subjectiveListeningChecked':False}
  LEDGER.write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
  print(cue['id'],round(len(x)/sr,3),'wallSeconds',round(time.perf_counter()-clip_clock,2),flush=True)
if __name__=='__main__':main()
