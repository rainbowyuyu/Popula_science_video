"""Isolated ASR for launch-v2 voice; never writes historical timelines."""
from pathlib import Path
import sys,time,json,difflib,argparse
sys.path.insert(0,str(Path(__file__).resolve().parent))
from voice import ROOT,read,save,spoken
from qc import chars,simplified
from faster_whisper import WhisperModel
p=argparse.ArgumentParser();p.add_argument('--watch',action='store_true');a=p.parse_args()
plan=read(ROOT/'research/launch-v2-voice-plan.json')
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=3)
started=time.monotonic()
while True:
 done=[]
 for row in plan['shots']:
  takepath=ROOT/'audio/takes'/f"{row['id']}.json"
  if not takepath.exists():continue
  take=read(takepath)
  if take['ttsText']!=spoken(row):continue
  dest=ROOT/'audio/asr'/f"{row['id']}.json"
  if dest.exists() and read(dest).get('sourceSHA256')==take['sha256']:
   result=read(dest)
  else:
   segs,_=model.transcribe(str(ROOT/take['processed']),language='zh',beam_size=5,word_timestamps=True,vad_filter=False,condition_on_previous_text=False,initial_prompt=None,hallucination_silence_threshold=1.0)
   words=[dict(text=w.word,start=w.start,end=w.end,probability=w.probability) for seg in segs for w in (seg.words or [])]
   heard=simplified(''.join(w['text'] for w in words));target=chars(spoken(row));observed=chars(heard)
   matcher=difflib.SequenceMatcher(None,target,observed,autojunk=False)
   edits=[dict(op=tag,expected=target[a0:a1],heard=observed[b0:b1],start=a0,end=a1) for tag,a0,a1,b0,b1 in matcher.get_opcodes() if tag!='equal']
   flags=[];cps=len(target)/max(.01,take['rawDuration'])
   if matcher.ratio()<.8:flags.append('low_asr_match')
   if any(e['op']=='delete' and e['end']>=len(target)-1 for e in edits):flags.append('possible_missing_tail')
   if any(e['op']=='delete' and e['start']<=1 for e in edits):flags.append('possible_missing_head')
   if take.get('rawEndpointFlag'):flags.append('raw_endpoint')
   if cps>8.5 or cps<1.7:flags.append('unusual_speech_rate')
   if not words:flags.append('no_speech_recognized')
   result=dict(id=row['id'],scene=row['scene'],expected=spoken(row),heard=heard,words=words,ratio=matcher.ratio(),flags=flags,edits=edits,sourceSHA256=take['sha256'],duration=take['duration'],charactersPerSecond=cps,subjectiveListeningChecked=False,pronunciationListeningVerified=False,typographyNormalizationVersion=3,recognitionRun='launch-v2-isolated-cpu-whisper',edgeCoverage=dict(expectedFirst=target[:4],heardFirst=observed[:4],expectedLast=target[-4:],heardLast=observed[-4:],firstWordStart=words[0]['start'] if words else None,lastWordEnd=words[-1]['end'] if words else None))
   save(dest,result);print('ASR',row['id'],round(result['ratio'],3),flags,flush=True)
  done.append(result)
 save(ROOT/'research/launch-v2-asr-report.json',dict(completed=len(done),total=len(plan['shots']),flagged=[{k:r[k] for k in ('id','ratio','flags','expected','heard')} for r in done if r['flags']],subjectiveListeningChecked=False))
 if len(done)==len(plan['shots']) or not a.watch:break
 if time.monotonic()-started>2400:raise TimeoutError('v2 take generation incomplete')
 time.sleep(10)
print('ASR_COMPLETE',len(done),flush=True)