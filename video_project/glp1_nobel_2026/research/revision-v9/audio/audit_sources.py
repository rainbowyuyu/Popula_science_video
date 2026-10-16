"""Read-only V7 source audit, fresh unprompted ASR, and boundary evidence for V8."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,math,re,sys,difflib
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
TTS=Path('D:/python_project/tts')
sys.path.insert(0,str(ROOT/'scripts'))
from qc_v5 import chars

def read(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,r):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def db(x):return float(20*np.log10(max(float(x),1e-12)))
def wave(p):
 x,s=sf.read(p,dtype='float64');x=x.mean(axis=1) if x.ndim>1 else x
 if s!=48000:
  g=math.gcd(s,48000);x=resample_poly(x,48000//g,s//g)
 return x
def metrics(x):
 hop=480;r=np.sqrt(np.mean(x[:len(x)//hop*hop].reshape(-1,hop)**2,axis=1));threshold=max(10**(-50/20),float(r.max())*10**(-35/20));active=np.where(r>threshold)[0]
 return {'samples48k':len(x),'seconds':len(x)/48000,'peakDBFS':db(np.max(np.abs(x))),'first20msDBFS':db(np.sqrt(np.mean(x[:960]**2))),'last20msDBFS':db(np.sqrt(np.mean(x[-960:]**2))),'firstActiveMs':float(active[0]*10) if len(active) else None,'lastActiveToEndMs':float((len(x)-min(len(x),(active[-1]+1)*hop))/48) if len(active) else None,'activityThresholdDBFS':db(threshold),'finite':bool(np.isfinite(x).all()),'clippedSamples':int(np.count_nonzero(np.abs(x)>=.999))}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--asr',action='store_true');ap.add_argument('--only',default='');a=ap.parse_args()
 tl=read(ROOT/'src/timeline.json');rows=[];selected=set(a.only.split(',')) if a.only else None
 with sf.SoundFile(ROOT/'public/narration.wav') as narration:
  for clip in tl['clips']:
   sid=clip['id']
   source=ROOT/clip['audioSource'];taken=ROOT/'audio/revision-v5/takes'/f'{sid}.json'
   if sid=='h001':taken=source.parent/'take.json'
   take=read(taken);raw=ROOT/take.get('raw','')
   if sid=='h001':raw=source.parent/'raw.wav'
   x=wave(raw);y=wave(source);m=metrics(x);n=metrics(y)
   source_hash=sha(source);assert source_hash==clip['audioSHA256'] and sha(ROOT/'public/voice'/f'{sid}.wav')==source_hash,sid+' source identity'
   narration.seek(round(clip['startSeconds']*48000));placed=narration.read(len(y),dtype='float64');err=float(np.max(np.abs(placed-y)))
   assert err<1e-7,sid+' narration placement'
   length=min(len(x),len(y));hop=480;rx=np.sqrt(np.mean(x[:length//hop*hop].reshape(-1,hop)**2,axis=1));ry=np.sqrt(np.mean(y[:length//hop*hop].reshape(-1,hop)**2,axis=1));gain=db(np.sqrt(np.sum(y*y)/np.sum(x*x)));delta=20*np.log10(np.maximum(ry,1e-12)/np.maximum(rx,1e-12))-gain
   suspicious=np.where((rx>10**(-42/20))&(delta<-14))[0]
   flags=[]
   if m['last20msDBFS']>-48 or m['lastActiveToEndMs']<60:flags.append('raw_tail_needs_review')
   if m['firstActiveMs']<20:flags.append('raw_head_needs_review')
   if len(x)!=len(y):flags.append('raw_processed_length_difference')
   if len(suspicious):flags.append('processed_local_attenuation_needs_review')
   rows.append({'id':sid,'text':clip['text'],'spokenText':take.get('ttsText',clip.get('ttsText',clip['text'])),'raw':str(raw),'rawSHA256':sha(raw),'source':str(source),'sourceSHA256':source_hash,'takeRecord':str(taken),'rawMetrics':m,'processedMetrics':n,'narrationPlacementMaximumError':err,'approximateProcessingGainDB':gain,'strongRawAttenuationWindowsMs':(suspicious*10).tolist(),'flags':flags,'subjectiveListeningChecked':False})
 save(OUT/'source-boundary-audit.json',{'createdUTC':datetime.now(timezone.utc).isoformat(),'timelineSHA256':sha(ROOT/'src/timeline.json'),'sourceStorySHA256':sha(ROOT/'docs/story-v5.json'),'count':len(rows),'allNarrationPlacementsExact':True,'rows':rows,'finding':'V5 code performs no VAD or silence trimming on generated voice. VAD appears only in ASR analysis. Complete raw source length is preserved; source-level missing phonemes remain possible. Edge fade is applied on unpadded raw endpoints.','subjectiveListeningChecked':False})
 print(json.dumps({'count':len(rows),'flags':[{k:r[k] for k in ['id','flags','rawMetrics']} for r in rows if r['flags']]},ensure_ascii=False),flush=True)
 if not a.asr:return
 from faster_whisper import WhisperModel
 model=WhisperModel(str(TTS/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=3)
 for row in rows:
  if selected and row['id'] not in selected:continue
  p=OUT/'asr-no-vad'/f"{row['id']}.json"
  if p.exists() and read(p).get('sourceSHA256')==row['sourceSHA256']:continue
  segs,_=model.transcribe(row['source'],language='zh',beam_size=5,word_timestamps=True,vad_filter=False,condition_on_previous_text=False,initial_prompt=None)
  words=[];heard=''
  for s in segs:
   heard+=s.text
   words.extend({'text':w.word,'start':w.start,'end':w.end,'probability':w.probability} for w in (s.words or []))
  target=chars(row['spokenText']);observed=chars(heard);match=difflib.SequenceMatcher(None,target,observed,autojunk=False)
  edits=[{'op':tag,'expected':target[a0:a1],'heard':observed[b0:b1],'end':a1} for tag,a0,a1,b0,b1 in match.get_opcodes() if tag!='equal']
  result={'id':row['id'],'source':row['source'],'sourceSHA256':row['sourceSHA256'],'expected':row['spokenText'],'heard':heard,'ratio':match.ratio(),'edits':edits,'words':words,'model':'local whisper-small','options':{'language':'zh','beam_size':5,'word_timestamps':True,'vad_filter':False,'condition_on_previous_text':False,'initial_prompt':None},'subjectiveListeningChecked':False}
  save(p,result);print(row['id'],round(match.ratio(),3),heard,flush=True)
if __name__=='__main__':main()
