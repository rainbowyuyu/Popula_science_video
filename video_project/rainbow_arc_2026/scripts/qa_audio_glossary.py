from pathlib import Path
import json,re,difflib,hashlib
from faster_whisper import WhisperModel
from opencc import OpenCC
R=Path(__file__).resolve().parents[1];out=R/'research/audio/asr-glossary';out.mkdir(exist_ok=True);conv=OpenCC('t2s');model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=4);rows=json.loads((R/'research/story.json').read_text(encoding='utf8'))['clips'];ids={'r005','r007','r021','r022','r023','r024','r031','r037','r041','r044','r047','r049','r050'}
G='彩虹、雨幕、传播方向、折射、色散、反射、四十二度、四十度、反太阳方向、蓝紫色、圆锥、圆心、圆弧、主虹、副虹、五十一度、亚历山大暗带、尽头、身后、水雾。'
for row in rows:
 if row['id'] not in ids:continue
 p=R/'public/audio'/f"{row['id']}.wav";segs,_=model.transcribe(str(p),language='zh',beam_size=7,word_timestamps=True,vad_filter=False,condition_on_previous_text=False,initial_prompt=G);segs=list(segs);heard=conv.convert(''.join(s.text for s in segs));d={'id':row['id'],'expected':row['spoken'],'heard':heard,'glossary':G,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'subjectiveListeningChecked':False};(out/f"{row['id']}.json").write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8');print(row['id'],heard,flush=True)
