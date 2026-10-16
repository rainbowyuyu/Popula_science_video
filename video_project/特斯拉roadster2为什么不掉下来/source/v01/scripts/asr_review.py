"""Offline recognition of existing clean clips; no TTS regeneration or model download."""
from pathlib import Path
import os,json,unicodedata,difflib,math
ROOT=Path(__file__).resolve().parents[3]
os.environ['HF_HUB_OFFLINE']='1'
from faster_whisper import WhisperModel
OUT=ROOT/'work/v01/crosscheck';OUT.mkdir(parents=True,exist_ok=True)
DEST=OUT/'asr.json'
if DEST.exists():raise SystemExit('ASR already saved; read existing result instead')
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',local_files_only=True,cpu_threads=4)
timeline=json.loads((ROOT/'source/v01/timeline-preview.json').read_text(encoding='utf-8'))
results=[]
def norm(t):return ''.join(c for c in t if unicodedata.category(c)[0] in 'LN')
for scene in timeline['scenes']:
    audio=ROOT/f'audio/v01/{scene["id"]}-clean.wav'
    segments,info=model.transcribe(str(audio),language='zh',beam_size=5,word_timestamps=True,vad_filter=False,condition_on_previous_text=False)
    words=[];text=''
    for seg in segments:
        text+=seg.text
        for w in seg.words or []:words.append({'word':w.word,'start':w.start,'end':w.end,'probability':w.probability})
    target=norm(scene['text']);actual=norm(text);matcher=difflib.SequenceMatcher(None,target,actual,autojunk=False)
    mapping={}
    for block in matcher.get_matching_blocks():
        for i in range(block.size):mapping[block.a+i]=block.b+i
    chars=[]
    for w in words:
        letters=norm(w['word']);n=len(letters)
        for j,c in enumerate(letters):chars.append({'char':c,'start':w['start']+(w['end']-w['start'])*j/max(1,n),'end':w['start']+(w['end']-w['start'])*(j+1)/max(1,n)})
    assert ''.join(c['char'] for c in chars)==actual
    cursor=0;captions=[]
    for cap in scene['captions']:
        length=len(norm(cap['text']));indices=[mapping[i] for i in range(cursor,cursor+length) if i in mapping]
        if not indices:raise ValueError('Cannot align caption '+cap['text'])
        begin=chars[min(indices)]['start'];end=chars[max(indices)]['end'];cursor+=length
        captions.append({'text':cap['text'],'from':scene['from']+math.floor(begin*30),'to':scene['from']+math.ceil(end*30),'matchedCharacters':len(indices),'totalCharacters':length,'alignment':'offline Whisper-small word times plus matched-character interpolation; human review pending'})
    results.append({'id':scene['id'],'expected':scene['text'],'recognized':text,'matchRatio':matcher.ratio(),'words':words,'captions':captions,'opcodes':matcher.get_opcodes()})
    print(scene['id'],text,'ratio',matcher.ratio(),flush=True)
DEST.write_text(json.dumps({'engine':'local faster-whisper / whisper-small','language':'zh','vad':False,'subjectiveListeningChecked':False,'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print('ASR_SAVED',DEST)
