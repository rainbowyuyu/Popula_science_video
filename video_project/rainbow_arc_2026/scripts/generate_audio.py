"""Generate natural-length rainbow narration with local Qwen3-TTS and build a frame timeline."""
from pathlib import Path
import os, json, hashlib, gc, re, sys, argparse, inspect
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1]; TTS=Path(r'D:/python_project/tts'); STORY=ROOT/'research/story.json'; AUDIO=ROOT/'public/audio'; RAW=ROOT/'research/audio/raw'; TAKES=ROOT/'research/audio/takes'
for p in [AUDIO,RAW,TAKES]: p.mkdir(parents=True,exist_ok=True)
SR_OUT=48000; GAP=.12; SETTINGS=dict(temperature=.42,top_p=.86,repetition_penalty=1.05,non_streaming_mode=True,max_new_tokens=768)
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0,str(TTS))
from scipy.signal import resample_poly
from broadcast_voice import master_voice
VERSION='V06-protected-broadcast'
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def jd(path,obj): Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def trim_silence(x,sr):
 x=np.asarray(x,dtype=np.float64); x=x.mean(axis=1) if x.ndim>1 else x; block=max(1,int(sr*.01)); rms=np.array([np.sqrt(np.mean(x[i:i+block]**2)+1e-14) for i in range(0,len(x),block)]); v=np.where(rms>max(.0025,float(rms.max())*.035))[0]
 if len(v)==0:return x
 return x[max(0,int(v[0]*block-.065*sr)):min(len(x),int((v[-1]+1)*block+.11*sr))]
def resample(x,sr,dst):
 if sr==dst:return x
 from math import gcd
 g=gcd(sr,dst);return resample_poly(x,dst//g,sr//g).astype(np.float64)
def process(wav,sr):
 # Preserve the entire generated sentence, including weak tails. Protection is
 # explicit timing, not a substitute for a missing generated syllable.
 x=resample(wav,sr,SR_OUT); x=x-np.mean(x);peak=np.max(np.abs(x))+1e-9
 return x*(.96/peak) if peak>.96 else x
def caption_chunks(text,max_chars=22):
 out=[];cur=''
 for ch in text:
  cur+=ch
  if ch in '，。！？；：、' and len(cur)>=8 or len(cur)>=max_chars:out.append(cur);cur=''
 if cur:out.append(cur)
 if len(out)>=2 and len(out[-1])<4 and len(out[-2])+len(out[-1])<=max_chars:out[-2]+=out[-1];out.pop()
 return [s.strip() for s in out if s.strip()]
def load_model():
 os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'; import torch
 from qwen_tts import Qwen3TTSModel
 print('VERIFIED_ENTRY',str(inspect.signature(Qwen3TTSModel.generate_voice_clone)),flush=True)
 device=os.environ.get('RAINBOW_TTS_DEVICE','cuda:0');torch.set_num_threads(4);model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map=device,dtype=torch.float32 if device=='cpu' else torch.bfloat16,attn_implementation='sdpa'); ref=json.loads((TTS/'work/clone-reference.json').read_text(encoding='utf8')); prompt=model.create_voice_clone_prompt(ref_audio=str(TTS/'work/clone-reference.wav'),ref_text=ref['text']); return model,prompt,torch
def main():
 p=argparse.ArgumentParser();p.add_argument('--timeline-only',action='store_true');p.add_argument('--only',nargs='*');args=p.parse_args()
 story=json.loads(STORY.read_text(encoding='utf8')); rows=story['clips']; model=prompt=torch=None; records=[];reference_sha=sha(TTS/'work/clone-reference.wav')
 for idx,row in enumerate(rows,1):
  cid=row['id']; text=row['spoken']; clean=AUDIO/f'{cid}.wav'; raw=RAW/f'{cid}-raw.wav'; meta=TAKES/f'{cid}.json'; old=None
  if clean.exists() and meta.exists():
   try:old=json.loads(meta.read_text(encoding='utf8'))
   except Exception:old=None
  if old and old.get('text')==text and old.get('sampleRate')==SR_OUT and old.get('version')==VERSION and old.get('referenceSHA256')==reference_sha: records.append(old); print('CACHED',cid,round(old['duration'],2),flush=True); continue
  if args.timeline_only:raise RuntimeError('Missing current take '+cid)
  if args.only and cid not in args.only:continue
  if model is None:model,prompt,torch=load_model()
  print('GENERATE',idx,'/',len(rows),cid,flush=True); seed=int(hashlib.sha256((cid+text).encode('utf8')).hexdigest()[:8],16); torch.manual_seed(seed); waves,sr=model.generate_voice_clone(text=text,language='Chinese',voice_clone_prompt=prompt,**SETTINGS); audio=process(np.asarray(waves[0]),sr); sf.write(raw,audio,SR_OUT,subtype='PCM_24');protected=RAW/f'{cid}-protected.wav';sf.write(protected,np.pad(audio,(round(.08*SR_OUT),round(.16*SR_OUT))),SR_OUT,subtype='PCM_24');report=TAKES/f'{cid}-master.json';master_voice(protected,clean,report);info=sf.info(clean); rec={'id':cid,'scene':row['scene'],'text':text,'raw':raw.relative_to(ROOT).as_posix(),'audio':clean.relative_to(ROOT).as_posix(),'duration':round(info.frames/SR_OUT,6),'sampleRate':SR_OUT,'sha256':sha(clean),'rawSHA256':sha(raw),'version':VERSION,'referenceSHA256':reference_sha,'seed':seed,'settings':SETTINGS,'model':'Qwen3-TTS-0.6B','reference':'D:/python_project/tts/work/clone-reference.wav','subjectiveListeningChecked':False}; jd(meta,rec); records.append(rec); print('READY',cid,round(rec['duration'],2),'s',flush=True); gc.collect();torch.cuda.empty_cache()
 if args.only:return
 parts=[];cursor=0.;clips=[];captions=[]
 for row,rec in zip(rows,records):
  x,_=sf.read(ROOT/rec['audio'],dtype='float64'); x=np.asarray(x); x=x.mean(axis=1) if x.ndim>1 else x
  if parts:parts.append(np.zeros(int(round(GAP*SR_OUT)),dtype=np.float64));cursor+=GAP
  start=cursor;end=start+len(x)/SR_OUT;parts.append(x);clips.append({'id':row['id'],'scene':row['scene'],'heading':{'street':'追不到的桥','drop':'光进水滴','dispersion':'颜色分开','reflection':'回头一次','angle':'约42°','cone':'眼睛是圆锥尖端','circle':'圆被地面遮住','observer':'水滴换了一批','secondary':'多一次反射','return':'背对太阳，看向水雾'}[row['scene']],'caption':row['text'][:22],'text':row['text'],'spoken':row['spoken'],'start':round(start,6),'end':round(end,6),'duration':round(end-start,6),'audio':rec['audio'],'audioSHA256':rec['sha256']}); chunks=caption_chunks(row['text']); total=sum(len(c) for c in chunks) or 1;t=start
  for c in chunks: dur=(end-start)*len(c)/total;captions.append({'start':round(t,6),'end':round(t+dur,6),'text':c});t+=dur
  cursor=end
 narration=np.concatenate(parts) if parts else np.zeros(1,dtype=np.float64);sf.write(AUDIO/'narration.wav',narration,SR_OUT,subtype='PCM_24');duration=cursor+float(story.get('referencesSeconds',8));fps=int(story.get('fps',30));scenes=[]
 for scene in ['street','drop','dispersion','reflection','angle','cone','circle','observer','secondary','return']:
  cs=[c for c in clips if c['scene']==scene]
  if cs:scenes.append({'id':scene,'start':cs[0]['start'],'end':cs[-1]['end']})
 scenes.append({'id':'references','start':round(cursor,6),'end':round(duration,6)});tl={'timeUnit':'seconds','fps':fps,'duration':int(round(duration*fps)),'seconds':round(duration,6),'clips':clips,'captions':captions,'scenes':scenes,'audio':{'narration':'public/audio/narration.wav','sampleRate':SR_OUT,'referencesSeconds':story.get('referencesSeconds',8),'naturalTiming':True,'noTimeStretch':True,'captionAlignment':'temporary-character-estimate-until-ASR'}};jd(ROOT/'src/timeline.json',tl);jd(AUDIO/'audio-manifest.json',{'durationSeconds':round(duration,6),'narrationSeconds':round(cursor,6),'referencesSeconds':story.get('referencesSeconds',8),'clips':records,'sha256':sha(AUDIO/'narration.wav'),'subjectiveListeningChecked':False});jd(ROOT/'research/audio/timeline-audio.json',tl);print(json.dumps({'clips':len(clips),'seconds':round(duration,2),'narrationSeconds':round(cursor,2),'references':story.get('referencesSeconds',8)},ensure_ascii=False))
if __name__=='__main__':main()
