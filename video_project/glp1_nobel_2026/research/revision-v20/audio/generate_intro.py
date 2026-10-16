"""V20 isolated opening revision. Reuses the existing personal voice."""
from pathlib import Path
import os,sys,json,hashlib,importlib.util,gc,math,re,difflib
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
TTS=Path('D:/python_project/tts')
TEXT='一顿饭吃下去，血糖会升高。身体怎么把它稳住？这和血压、血脂，又有什么关系？'
SETTINGS=dict(temperature=.30,top_p=.82,repetition_penalty=1.05,non_streaming_mode=True,max_new_tokens=2048)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def chars(x):return re.sub(r'[^\w\u4e00-\u9fff]','',x).lower()

def main():
 os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
 import torch
 from qwen_tts import Qwen3TTSModel
 torch.set_num_threads(3)
 model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
 ref=TTS/'work/clone-reference.wav';reftext=TTS/'work/clone-reference.json'
 prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=json.loads(reftext.read_text(encoding='utf8'))['text'])
 spec=importlib.util.spec_from_file_location('broadcast',TTS/'broadcast_voice.py');cleaner=importlib.util.module_from_spec(spec);spec.loader.exec_module(cleaner)
 records=[]
 for attempt in [1,2]:
  base=OUT/f'candidate-{attempt:02d}';base.mkdir(exist_ok=True)
  seed=2000+attempt;torch.manual_seed(seed);np.random.seed(seed)
  waves,sr=model.generate_voice_clone(text=[TEXT],language=['Chinese'],voice_clone_prompt=prompt,**SETTINGS)
  x=np.asarray(waves[0],dtype=np.float64);raw=base/'raw.wav';sf.write(raw,x,sr,subtype='PCM_24')
  if sr!=48000:
   g=math.gcd(sr,48000);x=resample_poly(x,48000//g,sr//g)
  guarded=base/'guarded.wav';sf.write(guarded,np.pad(x,(3840,7680)),48000,subtype='PCM_24')
  dest=base/'h001.wav';processing=cleaner.master_voice(guarded,dest)
  assert sf.info(dest).frames==len(x)+11520
  r=dict(id='h001',text=TEXT,ttsText=TEXT,caption=TEXT,seed=seed,settings=SETTINGS,raw=str(raw),rawSHA256=sha(raw),processed=str(dest),sha256=sha(dest),guardLeadingSeconds=.08,guardTrailingSeconds=.16,durationSeconds=sf.info(dest).duration,rawEndpointRMSDBFS=float(20*np.log10(max(np.sqrt(np.mean(x[-960:]**2)),1e-12))),referenceSHA256=sha(ref),referenceTextSHA256=sha(reftext),processorSHA256=sha(TTS/'broadcast_voice.py'),model='Qwen3-TTS-0.6B',processing=processing,timeStretch=False,trimmed=False,subjectiveListeningChecked=False)
  save(base/'take.json',r);records.append(r);print('READY',attempt,r['durationSeconds'],flush=True)
 del model,prompt;gc.collect();torch.cuda.empty_cache()
 from faster_whisper import WhisperModel
 asr=WhisperModel(str(TTS/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=3)
 for r in records:
  segments,_=asr.transcribe(r['processed'],language='zh',beam_size=5,word_timestamps=True,vad_filter=False,condition_on_previous_text=False,initial_prompt=None)
  heard='';words=[]
  for segment in segments:
   heard+=segment.text
   words.extend(dict(text=w.word,start=w.start,end=w.end,probability=w.probability) for w in (segment.words or []))
  match=difflib.SequenceMatcher(None,chars(TEXT),chars(heard),autojunk=False)
  ar=dict(expected=TEXT,heard=heard,ratio=match.ratio(),words=words,sourceSHA256=r['sha256'],unprompted=True,vad=False,subjectiveListeningChecked=False)
  save(Path(r['processed']).parent/'asr.json',ar);print('ASR',Path(r['processed']).parent.name,match.ratio(),heard,flush=True)
 save(OUT/'candidates.json',records)
if __name__=='__main__':main()
