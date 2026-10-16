"""Same deployed user model/reference, optional owned-server acceleration. No downloads."""
from pathlib import Path
import argparse,hashlib,json,time,os,platform
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
os.environ['USE_TF']='0';os.environ['USE_FLAX']='0'
PARAMS={'temperature':.48,'top_p':.88,'repetition_penalty':1.1,'max_new_tokens':1000,'non_streaming_mode':True}
ROOT=Path(__file__).resolve().parent
DEPLOYED=Path('/home/fusion/marine-energy-v8-audio-20261014')
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def save(p,d):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix(p.suffix+'.tmp')
 tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8');tmp.replace(p)
def main():
 p=argparse.ArgumentParser();p.add_argument('--ids',default='');p.add_argument('--batch-size',type=int,default=4);a=p.parse_args()
 story=json.loads((ROOT/'story.json').read_text(encoding='utf8'))
 ids=set(a.ids.split(',')) if a.ids else None
 rows=[c for c in story['cues'] if ids is None or c['id'] in ids]
 ref=DEPLOYED/'clone-reference.wav';modelpath=DEPLOYED/'model'
 rh=sha(ref);mh=sha(modelpath/'model.safetensors')
 assert rh=='dd8b89f70ab634af820966c01f3af535adcba7323427866d646c0dc1f6280bf7'
 assert mh=='180b3b10eb1c9f1b4db7806d5475bae3071c0243c299d49926bab1da3b6946f6'
 import torch,numpy as np,soundfile as sf
 from qwen_tts import Qwen3TTSModel
 torch.set_num_threads(4)
 model=Qwen3TTSModel.from_pretrained(str(modelpath),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
 reftext=json.loads((DEPLOYED/'clone-reference.json').read_text(encoding='utf8'))['text']
 prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=reftext)
 ledger={};lp=ROOT/'voice-generation-remote.json'
 if lp.exists():ledger=json.loads(lp.read_text(encoding='utf8'))
 (ROOT/'raw').mkdir(exist_ok=True)
 for i in range(0,len(rows),a.batch_size):
  batch=rows[i:i+a.batch_size];batchids=[c['id'] for c in batch]
  seed=2026101500+int(batch[0]['id'][1:])-1
  specs=[]
  for c in batch:
   spec={'text':c['spokenText'],'referenceSha256':rh,'model':'Qwen3-TTS-0.6B','modelPath':str(modelpath),
    'modelWeightsSha256':mh,'seed':seed,'parameters':PARAMS,'batchIds':batchids,'batchSize':len(batch)}
   specs.append(spec)
  requests=[hashlib.sha256(json.dumps(s,sort_keys=True,ensure_ascii=False).encode()).hexdigest() for s in specs]
  if all(c['id'] in ledger and ledger[c['id']]['requestHash']==k and (ROOT/'raw'/f"{c['id']}.wav").exists() for c,k in zip(batch,requests)):continue
  torch.manual_seed(seed);np.random.seed(seed);clock=time.perf_counter()
  waves,sr=model.generate_voice_clone(text=[c['spokenText'] for c in batch],language=['Chinese']*len(batch),voice_clone_prompt=prompt,**PARAMS)
  for c,spec,key,wave in zip(batch,specs,requests,waves):
   x=np.asarray(wave,np.float32);assert len(x) and np.isfinite(x).all()
   dest=ROOT/'raw'/f"{c['id']}.wav";sf.write(dest,x,sr,subtype='PCM_24')
   ledger[c['id']]={**spec,'displayText':c['text'],'requestHash':key,'sourceStorySha256':sha(ROOT/'story.json'),
    'rawDurationSec':len(x)/sr,'sampleRate':sr,'file':f"work/audio/raw/{c['id']}.wav",'sha256':sha(dest),
    'device':'cuda:0','physicalGPU':os.environ.get('CUDA_VISIBLE_DEVICES'),'deviceName':torch.cuda.get_device_name(0),
    'host':platform.node(),'remoteJob':str(ROOT),'torchVersion':torch.__version__,'cudaVersion':torch.version.cuda,
    'wallSecondsForBatch':time.perf_counter()-clock,'actualProvider':'user-owned-GPU-deployed-same-Qwen-clone',
    'subjectiveListeningChecked':False}
   save(lp,ledger);print(c['id'],round(len(x)/sr,3),'batchSec',round(time.perf_counter()-clock,2),flush=True)
 save(ROOT/'completed.json',{'cueIds':list(ledger),'completed':True,'sourceStorySha256':sha(ROOT/'story.json')})
if __name__=='__main__':main()
