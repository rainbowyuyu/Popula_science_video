from pathlib import Path
import json,re,difflib,math,hashlib
import numpy as np,soundfile as sf
from opencc import OpenCC
R=Path(__file__).resolve().parents[1];conv=OpenCC('t2s');tl=json.loads((R/'src/timeline.json').read_text(encoding='utf8'));asr=R/'research/audio/asr'
nums={'42':'四十二','40':'四十','51':'五十一'}
def norm(t):
 t=conv.convert(t).replace('著','着')
 for a,b in nums.items():t=t.replace(a,b)
 return re.sub(r'[^\u4e00-\u9fff0-9A-Za-z]','',t)
def chunks(t):
 result=[];current=''
 for c in t:
  current+=c
  if (c in '，。！？；：、' and len(current)>=8) or len(current)>=22:
   result.append(current);current=''
 if current:
  if len(current)<5 and result and len(result[-1])+len(current)<=22:result[-1]+=current
  else:result.append(current)
 return result
caps=[];quality=[]
for clip in tl['clips']:
 d=json.loads((asr/(clip['id']+'.json')).read_text(encoding='utf8'));exp=norm(clip['text']);heard='';times=[]
 for w in d['words']:
  a=norm(w['text']);n=len(a)
  for i,c in enumerate(a):heard+=c;times.append([w['start']+(w['end']-w['start'])*i/max(n,1),w['start']+(w['end']-w['start'])*(i+1)/max(n,1)])
 mapped=[None]*len(exp)
 for tag,i0,i1,j0,j1 in difflib.SequenceMatcher(None,exp,heard,autojunk=False).get_opcodes():
  if i1<=i0:continue
  if j1>j0:
   a=times[j0][0];b=times[j1-1][1]
  else:
   a=times[j0-1][1] if j0 else 0;b=times[j0][0] if j0<len(times) else clip['duration']
  for k in range(i0,i1):mapped[k]=[a+(b-a)*(k-i0)/(i1-i0),a+(b-a)*(k-i0+1)/(i1-i0)]
 ix=0; cs=chunks(clip['text'])
 for c in cs:
  n=len(norm(c));valid=[x for x in mapped[ix:ix+n] if x]
  a=valid[0][0] if valid else clip['duration']*ix/max(len(exp),1);b=valid[-1][1] if valid else clip['duration']*(ix+n)/max(len(exp),1);ix+=n
  caps.append({'start':round(clip['start']+max(0,a-.04),6),'end':round(clip['start']+min(clip['duration'],max(a+.25,b+.04)),6),'text':c,'clipId':clip['id']})
 ratio=difflib.SequenceMatcher(None,exp,norm(d['heard']),autojunk=False).ratio();quality.append({'id':clip['id'],'normalizedTextRatio':ratio,'heard':d['heard'],'expected':clip['text']})
# Avoid captions fighting on shared punctuation boundary.
for i in range(len(caps)-1):caps[i]['end']=min(caps[i]['end'],caps[i+1]['start'])
tl['captions']=caps;tl['timeUnit']='seconds';tl['captionTiming']='whisper-small word timestamps aligned to the authored text; exact audio duration; no time stretch';tl['duration']=math.ceil(tl['seconds']*tl['fps'])
(R/'src/timeline.json').write_text(json.dumps(tl,ensure_ascii=False,indent=2),encoding='utf8');(R/'research/audio/timeline-audio.json').write_text(json.dumps(tl,ensure_ascii=False,indent=2),encoding='utf8')
assert all(len(c['text'])<=22 for c in caps);assert all(c['end']>c['start'] for c in caps)
report={'captionCount':len(caps),'maximumCaptionChars':max(len(c['text']) for c in caps),'seconds':tl['seconds'],'frames':tl['duration'],'timeUnit':'seconds','method':tl['captionTiming'],'normalizedMeanTextRatio':sum(q['normalizedTextRatio'] for q in quality)/len(quality),'checks':quality,'homophoneASRLimiation':'Text differences include homophones (虹/红,弧/湖,身后/深厚), so automatic transcription alone is not a manual pronunciation guarantee.','subjectiveListeningChecked':False}
(R/'research/audio/caption-timing-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False,indent=2))
