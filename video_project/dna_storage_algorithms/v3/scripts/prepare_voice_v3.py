"""Process raw voice exactly once and lock subtitles to measured clip timing."""
from pathlib import Path
import sys,json,re,hashlib
import numpy as np
import soundfile as sf
sys.path.insert(0,'D:/python_project/tts')
from broadcast_voice import master_voice
V3=Path(__file__).resolve().parents[1]
SR=48000
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def split_text(text):
 # Keep one sense per caption, reserve punctuation without stacking paragraphs.
 clauses=re.findall(r'[^，。！？；：、]+[，。！？；：、]?',text)
 out=[]
 for clause in clauses:
  while len(clause)>23:
   cut=22
   for candidate in ['的','里','以后','以后','就','和','再','把']:
    i=clause.rfind(candidate,10,23)
    if i>=10:cut=i+len(candidate);break
   out.append(clause[:cut]);clause=clause[cut:]
  if clause:out.append(clause)
 combined=[];buffer=''
 for clause in out:
  if buffer and (len(buffer)+len(clause)>23 or buffer[-1]in'。！？；'):
   combined.append(buffer);buffer=''
  buffer+=clause
 if buffer:combined.append(buffer)
 return combined
def main():
 npath=V3/'src/narration.json';narr=json.loads(npath.read_text(encoding='utf8'))
 rawdir=V3/'public/audio/raw';destdir=V3/'public/audio/clean';destdir.mkdir(parents=True,exist_ok=True)
 protected=V3/'public/audio/protected';protected.mkdir(parents=True,exist_ok=True)
 reports=V3/'research/voice-processing';reports.mkdir(parents=True,exist_ok=True)
 errors=[]
 for cue in narr['cues']:
  src=rawdir/f"{cue['id']}.wav";dst=destdir/src.name;report=reports/f"{cue['id']}.json"
  if not src.exists():errors.append(cue['id']);continue
  old=json.loads(report.read_text(encoding='utf8')) if report.exists() else {}
  if old.get('originalRawSha256')!=sha(src) or not dst.exists():
   x,sr=sf.read(src,dtype='float32');x=np.pad(x,(round(.08*sr),round(.16*sr)))
   pad=protected/src.name;sf.write(pad,x,sr,subtype='PCM_24')
   result=master_voice(pad,dst)
   result.update(originalRawSha256=sha(src),preGuardSec=.08,postGuardSec=.16)
   report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
  cue['actualDuration']=sf.info(dst).duration
  cue['rawDuration']=sf.info(src).duration
  cue['audioFile']=dst.relative_to(V3/'public').as_posix()
 if errors:raise RuntimeError('Missing sources: '+','.join(errors))
 rows=[]
 for group in narr['groups']:
  cues=[x for x in narr['cues']if x['shotId']==group['id']]
  total=sum(x['actualDuration']for x in cues);window=group['endSec']-group['startSec']
  minimum=.16*(len(cues)-1)+.25+.25
  if total+minimum>window:
   rows.append({'shotId':group['id'],'status':'overlong','seconds':total,'window':window,'shortenBy':round(total+minimum-window,3)})
   continue
  # Distribute genuine observation room between complete clauses; never stretch.
  margin=window-total
  lead=min(.7,margin*.17);tail=min(1.2,margin*.24)
  gap=(margin-lead-tail)/(len(cues)-1) if len(cues)>1 else 0
  at=group['startSec']+lead
  for cue in cues:
   cue['startSec']=round(at,6);cue['endSec']=round(at+cue['actualDuration'],6)
   cue['startFrame']=round(at*30);cue['endFrame']=round((at+cue['actualDuration'])*30)
   cue['timingStatus']='measured-unscaled';at+=cue['actualDuration']+gap
  rows.append({'shotId':group['id'],'status':'ok','voicedClipSeconds':total,'window':window,'gapSeconds':gap,'leadSeconds':lead,'tailSeconds':tail})
 (V3/'research/voice-timing.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
 if any(x['status']=='overlong'for x in rows):raise RuntimeError('Overlong groups; see voice-timing.json; reauthor and re-record, never truncate')
 captions=[]
 for cue in narr['cues']:
  clauses=split_text(cue['text']);weights=[len(re.sub(r'[^\w\u4e00-\u9fff]','',x)) for x in clauses]
  at=cue['startSec']+.08;span=cue['rawDuration'];cumulative=0
  for j,(text,w)in enumerate(zip(clauses,weights)):
   start=at+span*cumulative/sum(weights);cumulative+=w;end=at+span*cumulative/sum(weights)
   captions.append({'id':f"{cue['id']}-{j:02d}",'cueId':cue['id'],'shotId':cue['shotId'],'startFrame':round(start*30),'endFrame':round(end*30),'text':text,'timingMethod':'raw-clip-duration-weighted-clause; ASR-refinement-pending'})
 narr['totalRawSpeechClipSec']=sum(x['rawDuration']for x in narr['cues'])
 narr['totalProtectedClipSec']=sum(x['actualDuration']for x in narr['cues'])
 npath.write_text(json.dumps(narr,ensure_ascii=False,indent=2),encoding='utf8')
 (V3/'src/captions.json').write_text(json.dumps(captions,ensure_ascii=False,indent=2),encoding='utf8')
 voice=np.zeros((300*SR,2),np.float32)
 for cue in narr['cues']:
  x,sr=sf.read(V3/'public'/cue['audioFile'],dtype='float32');assert sr==SR
  a=round(cue['startSec']*SR);voice[a:a+len(x)]+=x[:,None]
 sf.write(V3/'public/audio/narration.wav',voice,SR,subtype='PCM_24')
 print(json.dumps({'rawSeconds':narr['totalRawSpeechClipSec'],'captions':len(captions),'groups':rows},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
