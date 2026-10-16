"""V8 isolated personal-voice generation; preserves immutable raw fragments."""
from pathlib import Path
import os,sys,json,hashlib,argparse,importlib.util,gc,time
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent;TTS=Path('D:/python_project/tts')
sys.path.insert(0,str(ROOT/'scripts'))
from voice_v5 import SETTINGS,model_identity
from audit_sources import metrics,wave
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf8'))
def save(p,r):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--attempt',type=int,default=1);ap.add_argument('--only',default='');ap.add_argument('--parts',default='');a=ap.parse_args()
 plan=read(OUT/'generation-plan.json');story=Path(plan['story']);expected=plan['storySHA256'];assert sha(story)==expected
 base=OUT/f'candidate-{a.attempt:02d}';base.mkdir(exist_ok=True)
 selected=set(a.only.split(',')) if a.only else None
 selected_parts=set(a.parts.split(',')) if a.parts else None
 rows=[r for r in plan['takes'] if selected is None or r['id'] in selected]
 jobs=[]
 for row in rows:
  for i,text in enumerate(row['parts']):
   part=f"{row['id']}-p{i+1:02d}";p=base/'parts'/f'{part}.json'
   if selected_parts is not None and part not in selected_parts:continue
   if p.exists():
    old=read(p)
    if old['ttsText']==text and sha(Path(old['processed']))==old['sha256']:continue
    raise RuntimeError('Existing candidate differs; use fresh attempt')
   jobs.append((row,i,part,text))
 print(json.dumps({'storySHA256':expected,'attempt':a.attempt,'jobs':len(jobs),'output':str(base)},ensure_ascii=False),flush=True)
 if jobs:
  os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
  import torch
  from qwen_tts import Qwen3TTSModel
  torch.set_num_threads(3);identity=model_identity();refsha=sha(TTS/'work/clone-reference.wav');reftextsha=sha(TTS/'work/clone-reference.json')
  model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
  prompt=model.create_voice_clone_prompt(ref_audio=str(TTS/'work/clone-reference.wav'),ref_text=read(TTS/'work/clone-reference.json')['text'])
  spec=importlib.util.spec_from_file_location('rainbow_broadcast_v8',TTS/'broadcast_voice.py');cleaner=importlib.util.module_from_spec(spec);spec.loader.exec_module(cleaner)
  for start in range(0,len(jobs),3):
   if sha(story)!=expected:raise RuntimeError('Story changed during synthesis')
   batch=jobs[start:start+3]
   payload={'texts':[j[3] for j in batch],'partIds':[j[2] for j in batch],'attempt':a.attempt,'settings':SETTINGS,'referenceSHA256':refsha,'modelSHA256':identity['sha256']};key=hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False).encode()).hexdigest();seed=int(key[:8],16)
   torch.manual_seed(seed);np.random.seed(seed)
   waves,rate=model.generate_voice_clone(text=[j[3] for j in batch],language=['Chinese']*len(batch),voice_clone_prompt=prompt,**SETTINGS)
   for (row,i,part,text),generated_wave in zip(batch,waves):
    x=np.asarray(generated_wave,dtype=np.float64);assert len(x) and np.isfinite(x).all()
    raw=base/'raw'/f'{part}.wav';raw.parent.mkdir(exist_ok=True);
    if raw.exists():raw=raw.with_stem(raw.stem+'-'+str(time.time_ns()))
    sf.write(raw,x,rate,subtype='PCM_24')
    original=wave(raw);padded=base/'guarded'/f'{part}.wav';padded.parent.mkdir(exist_ok=True);sf.write(padded,np.pad(original,(3840,7680)),48000,subtype='PCM_24')
    dest=base/'processed'/f'{part}.wav';processing=cleaner.master_voice(padded,dest);info=sf.info(dest)
    assert info.frames==len(original)+11520
    m=metrics(original);rowpart={'id':row['id'],'partIndex':i,'ttsText':text,'storySHA256':expected,'attempt':a.attempt,'seed':seed,'signature':key,'settings':SETTINGS,'batchParts':[j[2] for j in batch],'modelIdentity':identity['sha256'],'referenceSHA256':refsha,'referenceTextSHA256':reftextsha,'raw':str(raw),'rawSHA256':sha(raw),'rawMetrics':m,'guardedSource':str(padded),'guardedSHA256':sha(padded),'processed':str(dest),'sha256':sha(dest),'durationSeconds':info.duration,'sampleRate':48000,'guardLeadingSeconds':.08,'guardTrailingSeconds':.16,'rawTailNeedsReview':m['last20msDBFS']>-48 or m['lastActiveToEndMs']<60,'processing':processing,'voiceSpeedFactor':1,'subjectiveListeningChecked':False}
    save(base/'parts'/f'{part}.json',rowpart);print('READY',part,round(info.duration,3),'tail',round(m['lastActiveToEndMs'],1),'ms',flush=True)
   gc.collect();torch.cuda.empty_cache()
 for row in rows:
  if not all((base/'parts'/f"{row['id']}-p{i+1:02d}.json").exists() for i in range(len(row['parts']))):continue
  parts=[read(base/'parts'/f"{row['id']}-p{i+1:02d}.json") for i in range(len(row['parts']))]
  dest=base/'voice'/f"{row['id']}.wav";dest.parent.mkdir(exist_ok=True)
  if dest.exists():continue
  x=np.concatenate([sf.read(p['processed'],dtype='float64')[0] for p in parts]);sf.write(dest,x,48000,subtype='PCM_24')
  cursor=0;placements=[]
  for p in parts:
   n=sf.info(p['processed']).frames;placements.append({'partIndex':p['partIndex'],'startSample':cursor,'endSample':cursor+n,'rawSpeechStartSample':cursor+3840,'ttsText':p['ttsText'],'sha256':p['sha256']});cursor+=n
  record={'id':row['id'],'text':row['text'],'ttsText':row['ttsText'],'storySHA256':expected,'processed':str(dest),'sha256':sha(dest),'duration':len(x)/48000,'samples':len(x),'sampleRate':48000,'parts':parts,'placements':placements,'timeStretch':False,'trimmed':False,'rawFragmentPreserved':True,'subjectiveListeningChecked':False}
  save(base/'takes'/f"{row['id']}.json",record)
 print('V8_CANDIDATE_COMPLETE',base,flush=True)
if __name__=='__main__':main()
