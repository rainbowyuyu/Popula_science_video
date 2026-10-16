"""No-prompt CPU ASR audit and clause timing refinement, never a listening claim."""
from pathlib import Path
import json,re,difflib,hashlib,sys
import numpy as np
V3=Path(__file__).resolve().parents[1]
OUT=V3/'work/audio-v4'
sys.path.insert(0,str(Path(__file__).resolve().parent/'audio_vendor'))
from opencc import OpenCC
CC=OpenCC('t2s')
def norm(s):
 s=CC.convert(s).translate(str.maketrans('0123456789','零一二三四五六七八九'))
 return re.sub(r'[^\w\u4e00-\u9fff]','',s).lower()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
 caps=json.loads((OUT/'captions.json').read_text(encoding='utf8'))
 oldpath=OUT/'asr-captions.json';rows=json.loads(oldpath.read_text(encoding='utf8')).get('cues',[])if oldpath.exists()else[];cache={r['id']:r for r in rows}
 rawCachePath=OUT/'raw-asr-audit.json'
 rawCache={r['id']:r for r in json.loads(rawCachePath.read_text(encoding='utf8')).get('cues',[])} if rawCachePath.exists() else {}
 model=None
 allrows=[]
 for cue in narr['cues']:
  p=V3/cue['workingAudioFile'];h=sha(p)
  if cue['id']in cache and cache[cue['id']].get('sha256')==h:row=cache[cue['id']]
  elif cue['id'] in rawCache and rawCache[cue['id']].get('rawSha256')==sha(OUT/'raw'/f"{cue['id']}.wav"):
   original=rawCache[cue['id']]
   row={**original,'sha256':h,'words':[{**w,'start':w['start']+.08,'end':w['end']+.08} for w in original['words']],
        'timingSource':'raw local ASR + exact 80 ms guard; clean filter latency compensated'}
  else:
   if model is None:
    from faster_whisper import WhisperModel
    model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=4,num_workers=1,local_files_only=True)
   segs,_=model.transcribe(str(p),language='zh',beam_size=3,condition_on_previous_text=False,word_timestamps=True,vad_filter=False)
   segs=list(segs);words=[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability}for s in segs for w in s.words]
   actual=''.join(s.text for s in segs);target=norm(cue['spokenText']);observed=norm(actual)
   row={'id':cue['id'],'sha256':h,'target':cue['text'],'asr':actual,'similarity':difflib.SequenceMatcher(None,target,observed).ratio(),'words':words,'subjectiveListeningChecked':False}
  row['similarity']=difflib.SequenceMatcher(None,norm(cue['spokenText']),norm(row['asr'])).ratio()
  row['comparisonNormalization']='OpenCC traditional-to-simplified; digit glyphs to spoken Chinese digits; punctuation removed'
  allrows.append(row)
  observed='';times=[]
  for w in row['words']:
   text=norm(w['word'])
   for i,ch in enumerate(text):observed+=ch;times.append(w['start']+(w['end']-w['start'])*(i+.5)/max(1,len(text)))
  target=norm(cue['text']);matched={}
  for match in difflib.SequenceMatcher(None,target,observed).get_matching_blocks():
   for k in range(match.size):matched[match.a+k]=times[match.b+k]
  these=[c for c in caps if c['cueId']==cue['id']]
  pos=0;spans=[]
  for c in these:
   length=len(norm(c['text']));spans.append((c,pos,pos+length));pos+=length
  if len(matched)>=max(2,len(target)*.65):
   # Boundaries use robust nearest matching characters, then stay monotonic.
   boundaries=[max(0,row['words'][0]['start']-.03)]
   for _,_,end in spans[:-1]:
    before=[matched[k]for k in matched if k<end];after=[matched[k]for k in matched if k>=end]
    boundaries.append((max(before)+min(after))/2 if before and after else cue['rawDuration']*end/max(1,len(target))+.08)
   boundaries.append(min(cue['actualDuration'],row['words'][-1]['end']+.10))
   boundaries=np.maximum.accumulate(boundaries)
   for i,(c,_,_)in enumerate(spans):
    c['startFrame']=round((cue['startSec']+float(boundaries[i]))*30);c['endFrame']=max(c['startFrame']+1,round((cue['startSec']+float(boundaries[i+1]))*30));c['timingMethod']='Whisper-small CPU word anchors, source-text preserved'
  (OUT/'captions.json').write_text(json.dumps(caps,ensure_ascii=False,indent=2),encoding='utf8')
  report={'model':'local Whisper-small','device':'CPU int8','initialPrompt':None,'vadFilter':False,'automaticOnly':True,'subjectiveListeningChecked':False,'cues':allrows,'reviewFlags':[r['id']for r in allrows if r['similarity']<.82]}
  oldpath.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
  print(cue['id'],round(row['similarity'],3),flush=True)
 def stamp(f):
  ms=round(f/30*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
 srt='\n\n'.join(f"{i+1}\n{stamp(c['startFrame'])} --> {stamp(c['endFrame'])}\n{c['text']}"for i,c in enumerate(caps))
 (OUT/'subtitles.srt').write_text(srt,encoding='utf8')
 print('ASR flags',report['reviewFlags'],flush=True)
if __name__=='__main__':main()
