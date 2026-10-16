"""Conservative cleanup and an actual-duration, non-stretched narration timeline."""
from pathlib import Path
import json, math, re, hashlib, sys, difflib
import numpy as np
import soundfile as sf
sys.path.insert(0,'D:/python_project/tts')
from broadcast_voice import master_voice,PROFILE
R=Path(__file__).resolve().parents[1]; Q=R/'research/metro/v2'; P=R/'public/metro/v2'
sr=48000; fps=30; spf=sr//fps
rows=json.loads((Q/'voice-lines.json').read_text('utf8'))
asr={r['id']:r for r in json.loads((Q/'asr-check.json').read_text('utf8'))['rows']} if (Q/'asr-check.json').exists() else {}
(P/'voice').mkdir(exist_ok=True,parents=True)
reports=[]; clips=[]; chunks=[]; frame=18
old_reports={r['id']:r for r in json.loads((Q/'voice-mastering.json').read_text('utf8'))} if (Q/'voice-mastering.json').exists() else {}
for i,row in enumerate(rows):
    src=P/'voice-raw'/(row['id']+'.wav'); dst=P/'voice'/(row['id']+'.wav')
    prior=old_reports.get(row['id'],{})
    if dst.exists() and prior.get('inputSha256')==hashlib.sha256(src.read_bytes()).hexdigest() and prior.get('outputSha256')==hashlib.sha256(dst.read_bytes()).hexdigest() and prior.get('profile')==PROFILE:
        report=prior
    else:report=master_voice(src,dst)
    reports.append({'id':row['id'],**report})
    w,s=sf.read(dst,dtype='float32'); assert s==sr and w.ndim==1
    nf=math.ceil(len(w)/spf)
    clips.append({**row,'start':frame,'end':frame+nf,'duration':nf,'audioSeconds':len(w)/sr})
    chunks.append((frame*spf,w)); frame+=nf+4
    if i<len(rows)-1 and row['scene']!=rows[i+1]['scene']: frame+=5
ref_start=frame; frame+=8*fps
full=np.zeros(frame*spf,np.float32)
for start,w in chunks: full[start:start+len(w)]+=w
sf.write(P/'narration.wav',np.column_stack([full,full]),sr,subtype='PCM_24')
scenes=[]
for scene in dict.fromkeys(c['scene'] for c in clips):
    cs=[c for c in clips if c['scene']==scene]
    scenes.append({'id':scene,'title':cs[0]['title'],'start':max(0,cs[0]['start']-9),'end':cs[-1]['end']+5})
scenes[0]['start']=0
for i in range(len(scenes)-1): scenes[i]['end']=scenes[i+1]['start']
scenes[-1]['end']=ref_start
scenes.append({'id':'references','title':'看见风，也看见边界','start':ref_start,'end':frame})
punct='，。？！：；、'
clean=lambda s:re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',s)
def split_caption(text):
    parts=re.findall(r'[^，。？！：；]+[，。？！：；]?',text); out=[]; buf=''
    for p in parts:
        if len(buf+p)>19 and buf: out.append(buf.strip(punct));buf=''
        if len(p)>22:
            if buf:out.append(buf.strip(punct));buf=''
            midpoint=len(p)//2; out.extend([p[:midpoint].strip(punct),p[midpoint:].strip(punct)])
        else:buf+=p
    if buf:out.append(buf.strip(punct))
    return out
def char_timing(row,clip):
    ref=clean(row['text']); rec=asr.get(row['id'],{}); heard=''; times=[]
    for w in rec.get('words',[]):
        chars=clean(w['text']); count=len(chars)
        for j,ch in enumerate(chars):
            heard+=ch; times.append((w['start']+(w['end']-w['start'])*j/max(1,count),w['start']+(w['end']-w['start'])*(j+1)/max(1,count)))
    mapped={}
    for b in difflib.SequenceMatcher(None,ref,heard).get_matching_blocks():
        for j in range(b.size):mapped[b.a+j]=times[b.b+j]
    coverage=len(mapped)/max(1,len(ref))
    if coverage<.70:return None,coverage
    # Interpolate only missing character timing between recognized neighbors.
    xs=np.array(sorted(mapped)); starts=np.array([mapped[x][0] for x in xs]); ends=np.array([mapped[x][1] for x in xs])
    return (np.interp(np.arange(len(ref)),xs,starts),np.interp(np.arange(len(ref)),xs,ends)),coverage
captions=[]; alignment=[]
for c in clips:
    parts=split_caption(c['text']); timing,coverage=char_timing(c,c)
    total=sum(len(clean(p)) for p in parts); cursor=0
    for part in parts:
        count=len(clean(part))
        if timing is not None and cursor+count<=len(timing[0]):a=float(timing[0][cursor]);b=float(timing[1][cursor+count-1])
        else:a=.06+(c['audioSeconds']-.12)*cursor/max(1,total);b=.06+(c['audioSeconds']-.12)*(cursor+count)/max(1,total)
        captions.append({'text':part,'start':c['start']+max(0,round(a*fps)-1),'end':min(c['end'],c['start']+max(1,round(b*fps)+3)),'clip':c['id']})
        cursor+=count
    alignment.append({'id':c['id'],'recognizedCharacterCoverage':coverage,'method':'asr-character-alignment' if timing is not None else 'duration-proportion-fallback'})
for i in range(len(captions)-1):captions[i]['end']=min(captions[i]['end'],captions[i+1]['start'])
assert all(c['end']>c['start'] for c in captions)
timeline={'fps':fps,'duration':frame,'seconds':frame/fps,'clips':clips,'captions':captions,'scenes':scenes}
for dest in [P/'timeline.json',R/'src/metro/timeline.json']:
    dest.parent.mkdir(exist_ok=True,parents=True);dest.write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf8')
def stamp(f):
    m=round(f/fps*1000);return f'{m//3600000:02}:{m//60000%60:02}:{m//1000%60:02},{m%1000:03}'
(Q/'subtitles.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}' for i,c in enumerate(captions)),encoding='utf8')
(Q/'voice-mastering.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
(Q/'caption-alignment.json').write_text(json.dumps(alignment,ensure_ascii=False,indent=2),encoding='utf8')
summary={'seconds':frame/fps,'frames':frame,'voiceClips':len(clips),'captions':len(captions),'codaSeconds':8,
    'timeStretch':False,'pitchShift':False,'paddedToTargetDuration':False,'voice':'User rainbow reference / local Qwen3-TTS-0.6B',
    'storySha256':hashlib.sha256((Q/'story.json').read_bytes()).hexdigest(),
    'voiceLedgerSha256':hashlib.sha256((Q/'voice-generation.json').read_bytes()).hexdigest(),
    'subjectiveListeningChecked':False,'scenes':scenes}
(Q/'timing-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(summary,ensure_ascii=False,indent=2))

