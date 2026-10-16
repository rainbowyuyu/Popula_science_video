from pathlib import Path
import json,re,difflib,os,sys
os.environ['HF_HUB_OFFLINE']='1'
from faster_whisper import WhisperModel
R=Path(__file__).resolve().parents[1];Q=R/'research/v3';story=json.loads((Q/'story.json').read_text('utf8'))
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cuda',compute_type='float16')
rows=[]
def norm(t):return re.sub(r'[^\u4e00-\u9fff0-9a-z]','',t.lower())
for row in story:
 segs,_=model.transcribe(str(R/'public/v3/voice-raw'/f"{row['id']}.wav"),language='zh',beam_size=3,vad_filter=False,word_timestamps=True)
 segs=list(segs);text=''.join(s.text for s in segs);ratio=difflib.SequenceMatcher(None,norm(row['text']),norm(text)).ratio()
 rows.append({'id':row['id'],'expected':row['text'],'recognized':text,'ratio':ratio,'words':[{'start':w.start,'end':w.end,'word':w.word} for s in segs for w in s.words]})
 if ratio<.72:print(row['id'],round(ratio,2),text,flush=True)
 (Q/'voice-check.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
print('ASR clips',len(rows),'mean',sum(x['ratio'] for x in rows)/len(rows),flush=True)
