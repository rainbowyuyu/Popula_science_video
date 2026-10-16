import os,json,re,sys,difflib
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
from faster_whisper import WhisperModel
R=Path(__file__).resolve().parents[1]
rows=json.loads((R/'research/episode3/story.json').read_text('utf8'))
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=6)
out=[]
for i,row in enumerate(rows):
 seg,info=model.transcribe(str(R/'public/episode3/voice-raw'/(row['id']+'.wav')),language='zh',beam_size=5,vad_filter=False,word_timestamps=True,initial_prompt='榫卯，榫头，卯口，榫肩，木销，楔子，柱础，檩条，椽子。')
 seg=list(seg);text=''.join(x.text for x in seg);clean=lambda s:re.sub(r'[^\u4e00-\u9fff0-9]','',s)
 score=difflib.SequenceMatcher(None,clean(text),clean(row['text'])).ratio()
 out.append({'id':row['id'],'reference':row['text'],'recognized':text,'textSimilarity':score,'segments':[{'start':x.start,'end':x.end,'text':x.text} for x in seg]})
 print(row['id'],round(score,2),flush=True)
 (R/'research/episode3/asr-check.json').write_text(json.dumps({'kind':'machine transcription; not human listening','rows':out},ensure_ascii=False,indent=2),encoding='utf8')
