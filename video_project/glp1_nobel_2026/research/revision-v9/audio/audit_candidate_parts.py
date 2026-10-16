"""Unprompted ASR of immutable V8 parts; optionally follows generation."""
from pathlib import Path
import argparse,json,time,difflib,hashlib
from audit_sources import chars,save,read,OUT,TTS
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--candidate',default='candidate-01');ap.add_argument('--watch',action='store_true');a=ap.parse_args()
 base=OUT/a.candidate;plan=read(OUT/'generation-plan.json');expected=sum(len(r['parts']) for r in plan['takes'])
 from faster_whisper import WhisperModel
 model=WhisperModel(str(TTS/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=3)
 started=time.monotonic()
 while True:
  records=sorted((base/'parts').glob('*.json'));ready=0
  for p in records:
   r=read(p);dest=base/'asr'/p.name
   if dest.exists() and read(dest).get('sourceSHA256')==r['sha256']:ready+=1;continue
   segs,_=model.transcribe(r['processed'],language='zh',beam_size=5,word_timestamps=True,vad_filter=False,condition_on_previous_text=False,initial_prompt=None)
   heard='';words=[]
   for s in segs:
    heard+=s.text;words.extend({'text':w.word,'start':w.start,'end':w.end,'probability':w.probability} for w in (s.words or []))
   target=chars(r['ttsText']);actual=chars(heard);match=difflib.SequenceMatcher(None,target,actual,autojunk=False)
   edits=[{'op':tag,'expected':target[a0:a1],'heard':actual[b0:b1],'end':a1} for tag,a0,a1,b0,b1 in match.get_opcodes() if tag!='equal']
   result={'id':r['id'],'partIndex':r['partIndex'],'expected':r['ttsText'],'heard':heard,'words':words,'sourceSHA256':r['sha256'],'ratio':match.ratio(),'edits':edits,'rawTailNeedsReview':r['rawTailNeedsReview'],'rawMetrics':r['rawMetrics'],'model':'local whisper-small','options':{'initial_prompt':None,'vad_filter':False,'beam_size':5,'word_timestamps':True,'condition_on_previous_text':False},'subjectiveListeningChecked':False}
   save(dest,result);ready+=1;print(p.stem,round(match.ratio(),3),heard,flush=True)
  if not a.watch or ready>=expected or time.monotonic()-started>3600:break
  time.sleep(5)
 print('CANDIDATE_ASR_READY',ready,'of',expected,flush=True)
if __name__=='__main__':main()
