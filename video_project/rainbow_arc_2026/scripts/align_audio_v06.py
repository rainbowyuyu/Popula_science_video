"""ASR-assisted semantic captions; character interpolation is explicitly recorded.

No claim of forced alignment or human listening. VAD is disabled so the end
of a generated sentence remains available for inspection.
"""
from pathlib import Path
import json,re,time,difflib,hashlib,sys
import numpy as np
from faster_whisper import WhisperModel
from opencc import OpenCC
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/audio/asr-v06';OUT.mkdir(parents=True,exist_ok=True)
STORY=json.loads((ROOT/'research/story.json').read_text('utf8'))
def jd(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n','utf8')
cc=OpenCC('t2s')
def norm(s):
    s=cc.convert(s)
    # Numbers returned as digits must share character timing with the Chinese
    # spoken/displayed form; these are the only numeric angles in this episode.
    for a,b in [('42','四十二'),('40','四十'),('51','五十一')]:s=s.replace(a,b)
    return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',s).lower()
def chunks(text):
    # Keep punctuation with its clause; split on meaning before enforcing width.
    units=re.findall(r'[^，。！？；：]+[，。！？；：]?',text);out=[]
    for u in units:
        while len(u)>22:
            # Pause words are preferred; the final hard split is only a fallback.
            k=max([i for i in range(9,min(22,len(u))) if u[i:i+1] in '的在也就而和'],default=21)
            out.append(u[:k]);u=u[k:]
        if out and len(u)<6 and len(out[-1])+len(u)<=22:out[-1]+=u
        else:out.append(u)
    return out
model=None;records=[]
for row in STORY['clips']:
    cid=row['id'];meta=ROOT/f'research/audio/takes/{cid}.json';audio=ROOT/f'public/audio/{cid}.wav'
    while True:
        try:
            m=json.loads(meta.read_text('utf8'))
            if m.get('version')=='V06-protected-broadcast' and m.get('text')==row['spoken']:break
        except (OSError,ValueError):pass
        time.sleep(3)
    cache=OUT/f'{cid}.json';old=json.loads(cache.read_text('utf8')) if cache.exists() else None
    if old and old.get('audioSHA256')==m['sha256']:rec=old
    else:
        if model is None:model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=4)
        segments,_=model.transcribe(str(audio),language='zh',beam_size=3,vad_filter=False,word_timestamps=True,condition_on_previous_text=False)
        segs=list(segments);actual=''.join(s.text for s in segs);words=[{'text':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in segs for w in (s.words or [])]
        rec={'id':cid,'expected':row['spoken'],'recognized':actual,'similarity':difflib.SequenceMatcher(None,norm(row['spoken']),norm(actual)).ratio(),'words':words,'audioSHA256':m['sha256'],'noVAD':True,'initialPrompt':None,'beamSize':3,'subjectiveListeningChecked':False}
        jd(cache,rec)
    # A cached transcript can be re-evaluated without another model inference.
    rec['similarity']=difflib.SequenceMatcher(None,norm(row['spoken']),norm(rec['recognized'])).ratio()
    rec['normalization']='OpenCC t2s; numeric angles expanded to Chinese words'
    if 'initialPrompt' not in rec:rec['initialPrompt']='topic vocabulary only; no expected sentence'
    jd(cache,rec);records.append(rec);jd(OUT/'progress.json',records);print(cid,'ASR',round(rec['similarity'],3),flush=True)
# Wait for the actual-length timeline written after all TTS sentences.
while True:
    try:
        tl=json.loads((ROOT/'src/timeline.json').read_text('utf8'))
        if len(tl['clips'])==len(STORY['clips']) and all(c['spoken']==s['spoken'] for c,s in zip(tl['clips'],STORY['clips'])):break
    except (OSError,ValueError):pass
    time.sleep(2)
captions=[];reports=[]
for clip,rec,row in zip(tl['clips'],records,STORY['clips']):
    expected=norm(row['text']);actual='';times=[]
    for w in rec['words']:
        chars=norm(w['text']);actual+=chars
        for i,c in enumerate(chars):times.append((w['start']+(w['end']-w['start'])*i/max(1,len(chars)),w['start']+(w['end']-w['start'])*(i+1)/max(1,len(chars))))
    positions=np.full((len(expected),2),np.nan)
    for b in difflib.SequenceMatcher(None,expected,actual).get_matching_blocks():
        for k in range(b.size):
            if b.b+k<len(times):positions[b.a+k]=times[b.b+k]
    known=np.where(np.isfinite(positions[:,0]))[0]
    if len(known):
        for j in range(2):positions[:,j]=np.interp(np.arange(len(expected)),known,positions[known,j])
    else:
        positions[:,0]=np.linspace(.08,clip['duration']-.16,len(expected));positions[:,1]=positions[:,0]+clip['duration']/max(1,len(expected))
    charpos=0;parts=chunks(row['text']);local=[]
    for p in parts:
        count=len(norm(p));a=charpos;b=min(len(expected)-1,charpos+max(1,count)-1);charpos+=count
        start=max(0,float(positions[a,0])-.04);end=min(clip['duration'],float(positions[b,1])+.07)
        local.append({'start':round(clip['start']+start,6),'end':round(clip['start']+max(end,start+.3),6),'text':p,'clipId':clip['id']})
    for i,c in enumerate(local[:-1]):c['end']=min(c['end'],local[i+1]['start'])
    captions.extend(local);reports.append({'id':clip['id'],'similarity':rec['similarity'],'matchedExpectedChars':len(known),'expectedChars':len(expected),'captionCount':len(parts),'mode':'ASR-word-times-with-character-interpolation','reviewFlag':rec['similarity']<.82})
tl['captions']=captions;tl['audio']['captionAlignment']='ASR-word-times-with-character-interpolation';jd(ROOT/'src/timeline.json',tl);jd(ROOT/'research/audio/timeline-audio.json',tl)
def timestamp(t):
    n=round(t*1000);h,n=divmod(n,3600000);m,n=divmod(n,60000);s,n=divmod(n,1000);return f'{h:02d}:{m:02d}:{s:02d},{n:03d}'
(ROOT/'delivery/彩虹为什么是弧形_V06.srt').write_text('\n\n'.join(f'{i+1}\n{timestamp(c["start"])} --> {timestamp(c["end"])}\n{c["text"]}' for i,c in enumerate(captions))+'\n','utf8')
jd(OUT/'alignment-report.json',{'method':'Whisper-small word timestamps, expected-text character mapping, semantic subtitles','notForcedAlignment':True,'humanListeningChecked':False,'clips':reports,'captionMaxChars':max(map(lambda c:len(c['text']),captions)),'captions':len(captions),'flags':[r['id'] for r in reports if r['reviewFlag']]})
print('ALIGNED',len(captions),'CAPTIONS',flush=True)
