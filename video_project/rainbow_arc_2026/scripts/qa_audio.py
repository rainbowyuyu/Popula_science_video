from pathlib import Path
import json,re,difflib,hashlib
from faster_whisper import WhisperModel
R=Path(__file__).resolve().parents[1]; out=R/'research/audio/asr';out.mkdir(exist_ok=True)
rows=json.loads((R/'research/story.json').read_text(encoding='utf8'))['clips']
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=4)
try:
 import opencc
 conv=opencc.OpenCC('t2s');sim=lambda x:conv.convert(x)
except Exception:sim=lambda x:x
norm=lambda s:re.sub(r'[^\u4e00-\u9fff0-9A-Za-z]','',sim(s))
report=[]
for row in rows:
 p=R/'public/audio'/f"{row['id']}.wav";target=out/f"{row['id']}.json"
 if target.exists():
  c=json.loads(target.read_text(encoding='utf8'))
  if c.get('sha256')==hashlib.sha256(p.read_bytes()).hexdigest():report.append(c);print('cached',row['id']);continue
 segs,_=model.transcribe(str(p),language='zh',beam_size=5,word_timestamps=True,vad_filter=False,condition_on_previous_text=False)
 segs=list(segs); heard=sim(''.join(s.text for s in segs));words=[{'text':sim(w.word),'start':w.start,'end':w.end,'probability':w.probability} for s in segs for w in (s.words or [])]
 ratio=difflib.SequenceMatcher(None,norm(row['spoken']),norm(heard),autojunk=False).ratio();c={'id':row['id'],'expected':row['spoken'],'heard':heard,'ratio':ratio,'words':words,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'subjectiveListeningChecked':False};target.write_text(json.dumps(c,ensure_ascii=False,indent=2),encoding='utf8');report.append(c);print(row['id'],round(ratio,3),heard,flush=True)
(R/'research/audio/asr-report.json').write_text(json.dumps({'clips':report,'meanRatio':sum(c['ratio'] for c in report)/len(report),'flagged':[c['id'] for c in report if c['ratio']<.90],'subjectiveListeningChecked':False},ensure_ascii=False,indent=2),encoding='utf8')
