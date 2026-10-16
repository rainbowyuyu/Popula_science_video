from pathlib import Path
import json,math,re,hashlib
import numpy as np,soundfile as sf
import sys
sys.path.insert(0,'D:/python_project/tts')
from broadcast_voice import master_voice

R=Path(__file__).resolve().parents[1]; P=R/'public/episode2'; Q=R/'research/episode2'; D=R/'delivery/episode2'; sr=48000; fps=30
rows=json.loads((Q/'story.json').read_text('utf8')); (P/'voice').mkdir(exist_ok=True); D.mkdir(exist_ok=True)
# Keep the final cut close to five minutes by removing a few redundant bridge
# sentences after the full narration has been generated and checked.
drop={'004','007','015','025','048'}
rows=[r for r in rows if r['id'] not in drop]
clips=[]; audio=[]; frame=24; reports=[]
for i,row in enumerate(rows):
    raw=P/'voice-raw'/f"{row['id']}.wav"; dest=P/'voice'/f"{row['id']}.wav"
    h=hashlib.sha256(raw.read_bytes()).hexdigest()
    oldpath=Q/'voice-mastering.json'; old=json.loads(oldpath.read_text('utf8')) if oldpath.exists() else {}
    oldrow=old.get(row['id'],{}) if isinstance(old,dict) else {}
    if oldrow.get('inputSha256')!=h or not dest.exists(): result=master_voice(raw,dest)
    else: result=oldrow
    reports.append({'id':row['id'],**result})
    w,s=sf.read(dest,dtype='float32'); assert s==sr
    nf=math.ceil(len(w)/sr*fps); w=np.pad(w,(0,nf*1600-len(w)))
    clips.append({**row,'start':frame,'end':frame+nf,'duration':nf}); audio.append((frame*1600,w)); frame+=nf+7
    if i<len(rows)-1 and row['scene']!=rows[i+1]['scene']: frame+=10
frame+=150
full=np.zeros((frame*1600,2),np.float32)
for start,w in audio:
    if w.ndim==1: w=np.column_stack([w,w])
    full[start:start+len(w)]+=w
sf.write(P/'narration.wav',full,sr,subtype='PCM_24')
scenes=[]
for scene in dict.fromkeys(c['scene'] for c in clips):
    cs=[c for c in clips if c['scene']==scene]; scenes.append({'id':scene,'title':cs[0]['title'],'start':max(0,cs[0]['start']-12),'end':cs[-1]['end']+12})
scenes[0]['start']=0
for i in range(len(scenes)-1): scenes[i]['end']=scenes[i+1]['start']
scenes.append({'id':'references','title':'光线为什么排成弧','start':frame-150,'end':frame})
def split_caption(text):
    parts=re.findall(r'[^，。？！：；]+[，。？！：；]?',text); out=[]; buf=''
    for x in parts:
        if len(buf+x)>22 and buf: out.append(buf.rstrip('，。？！：；')); buf=''
        buf+=x
    if buf: out.append(buf.rstrip('，。？！：；'))
    return out
captions=[]
for c in clips:
    parts=split_caption(c['text']); total=sum(len(p) for p in parts); cursor=0
    first=.08; last=c['duration']/fps-.10
    for part in parts:
        span=len(part); a=first+(last-first)*cursor/max(1,total); cursor+=span; b=first+(last-first)*cursor/max(1,total)
        captions.append({'text':part,'start':c['start']+round(a*fps),'end':min(c['end'],c['start']+round(b*fps)+2),'clip':c['id']})
for i in range(len(captions)-1): captions[i]['end']=min(captions[i]['end'],captions[i+1]['start'])
timeline={'fps':fps,'duration':frame,'seconds':frame/fps,'clips':clips,'captions':captions,'scenes':scenes}
for dst in [P/'timeline.json',R/'src/episode2/timeline.json']: dst.write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf8')
def stamp(f):
    ms=round(f/fps*1000); return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
(D/'subtitles.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions)),encoding='utf8')
(Q/'voice-mastering.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
(Q/'timing-summary.json').write_text(json.dumps({'seconds':frame/fps,'voiceClips':len(clips),'captions':len(captions),'timeStretch':False,'voice':'User rainbow reference / Qwen3 local','subjectiveListeningChecked':False},ensure_ascii=False,indent=2),encoding='utf8')
print('Timeline',frame,'frames',round(frame/fps,2),'seconds',len(captions),'captions')
