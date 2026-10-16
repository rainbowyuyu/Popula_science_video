"""Machine-assisted pronunciation/omission review; does not replace listening."""
import os, json, re, difflib, argparse, hashlib
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
from faster_whisper import WhisperModel
R=Path(__file__).resolve().parents[1]
Q=R/'research/metro'; P=R/'public/metro'
p=argparse.ArgumentParser(); p.add_argument('--ids',default=''); a=p.parse_args()
rows=json.loads((Q/'voice-lines.json').read_text('utf8'))
existing=json.loads((Q/'asr-check.json').read_text('utf8')).get('rows',[]) if (Q/'asr-check.json').exists() else []
out={r['id']:r for r in existing}
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=6)
clean=lambda s:re.sub(r'[^\u4e00-\u9fff0-9]','',s)
requested=set(a.ids.split(',')) if a.ids else None
for row in rows:
    if requested and row['id'] not in requested: continue
    source=P/'voice-raw'/(row['id']+'.wav')
    if not source.exists(): continue
    audio_sha=hashlib.sha256(source.read_bytes()).hexdigest()
    if requested is None and out.get(row['id'],{}).get('audioSha256')==audio_sha: continue
    seg,info=model.transcribe(str(P/'voice-raw'/(row['id']+'.wav')),language='zh',beam_size=5,
        vad_filter=False,word_timestamps=True,
        initial_prompt='地铁，站台，安全线，屏蔽门，活塞风，列车，车头，车尾，尾流，伯努利，压力，气流，重心。')
    seg=list(seg); text=''.join(s.text for s in seg)
    words=[{'start':w.start,'end':w.end,'text':w.word,'probability':w.probability} for s in seg for w in (s.words or [])]
    score=difflib.SequenceMatcher(None,clean(text),clean(row['text'])).ratio()
    out[row['id']]={'id':row['id'],'reference':row['text'],'recognized':text,'audioSha256':audio_sha,
        'textSimilarity':score,'words':words,'segments':[{'start':s.start,'end':s.end,'text':s.text} for s in seg]}
    print(row['id'],round(score,3),text,flush=True)
    (Q/'asr-check.json').write_text(json.dumps({'kind':'machine transcription; not human listening',
        'subjectiveListeningChecked':False,'rows':[out[k] for k in sorted(out)]},ensure_ascii=False,indent=2),encoding='utf8')
