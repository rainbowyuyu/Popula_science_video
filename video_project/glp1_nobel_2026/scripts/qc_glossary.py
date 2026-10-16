"""Second ASR pass with medical vocabulary; preserves the unprompted first pass."""
from pathlib import Path
import difflib,json
from voice import ROOT,read,save,sha
from qc import chars,simplified
from faster_whisper import WhisperModel

GLOSSARY='生理医学术语：小肠，肠壁，L细胞，肠促胰素，胰腺，胰岛，胰岛素抵抗，贝塔细胞，β细胞，胰高血糖素样肽一，受体，甘油三酯，脂肪酸，极低密度脂蛋白，低密度脂蛋白，胆固醇，肝細胞，主动脉，小动脉，平滑肌，管腔，管壁，肾脏，肾单位，过滤，回收，灌注，钠，钾，交感神经，睡眠呼吸暂停，斑块，泡沫细胞，炎症，血小板，血栓，冠状动脉，心梗，缺血性脑卒中，袖带，测血压，低血糖，力量练习，已有疾病，胰岛素，葡萄糖，传信分子，零点一五毫米，十五微米，纳米级。'
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=3)
rows=[]
for row in read(ROOT/'docs/story.json')['shots']:
    p=ROOT/'audio/asr'/f"{row['id']}.json"
    if not p.exists():continue
    prior=read(p)
    if prior['ratio']>=.9 and row['id'] not in ['g001','g002','g008','g010','g012','g013','g014','g015','g016','g020','g021','g022','g026','g028','g029','g030','g031','g033','g034','g035','g037','g038','g039','g041','g042','g047']:continue
    path=ROOT/'public/voice'/f"{row['id']}.wav"
    if prior['sourceSHA256']!=sha(path) or prior['expected']!=row.get('ttsText',row['text']):
        raise ValueError('Stale first-pass ASR; run qc.py before glossary review: '+row['id'])
    destination=ROOT/'audio/asr-glossary'/f"{row['id']}.json"
    if destination.exists():
        cached=read(destination)
        if (cached.get('sourceSHA256')==prior['sourceSHA256'] and cached.get('glossary')==GLOSSARY
                and cached.get('expected')==row.get('ttsText',row['text'])):
            rows.append(cached);continue
    segs,_=model.transcribe(str(path),language='zh',beam_size=7,word_timestamps=True,vad_filter=False,
        condition_on_previous_text=False,initial_prompt=GLOSSARY,hallucination_silence_threshold=1.0)
    words=[dict(text=w.word,start=w.start,end=w.end,probability=w.probability) for seg in segs for w in (seg.words or [])]
    heard=simplified(''.join(w['text'] for w in words));expected=row.get('ttsText',row['text'])
    ratio=difflib.SequenceMatcher(None,chars(expected),chars(heard),autojunk=False).ratio()
    d=dict(id=row['id'],expected=expected,heard=heard,ratio=ratio,priorHeard=prior['heard'],priorRatio=prior['ratio'],
           sourceSHA256=sha(path),words=words,glossary=GLOSSARY,subjectiveListeningChecked=False)
    save(destination,d);rows.append(d)
    print(row['id'],round(ratio,3),heard,flush=True)
save(ROOT/'research/glossary-qa.json',dict(checks=rows,subjectiveListeningChecked=False,
    limitation='Second pass given a domain glossary; not an independent guarantee of pronunciation. First pass remains saved.'))
