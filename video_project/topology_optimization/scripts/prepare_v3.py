from pathlib import Path
import sys,json,math,subprocess,re,hashlib,difflib
import numpy as np,soundfile as sf
sys.path.insert(0,'D:/python_project/tts')
from broadcast_voice import master_voice
R=Path(__file__).resolve().parents[1];P=R/'public/v3';Q=R/'research/v3';D=R/'delivery/v3';sr=48000;fps=30
rows=json.loads((Q/'story.json').read_text('utf8'));asr={r['id']:r for r in json.loads((Q/'voice-check.json').read_text('utf8'))} if (Q/'voice-check.json').exists() else {}
(P/'voice').mkdir(exist_ok=True);reports=[];clips=[];audio=[];frame=24
old={r['id']:r for r in json.loads((Q/'voice-mastering.json').read_text('utf8'))} if (Q/'voice-mastering.json').exists() else {}
for i,row in enumerate(rows):
 raw=P/'voice-raw'/f"{row['id']}.wav";dest=P/'voice'/f"{row['id']}.wav"
 cached=old.get(row['id'],{});h=hashlib.sha256(raw.read_bytes()).hexdigest()
 result=cached if cached.get('inputSha256')==h and dest.exists() and cached.get('outputSha256')==hashlib.sha256(dest.read_bytes()).hexdigest() else master_voice(raw,dest)
 reports.append({'id':row['id'],**result});w,s=sf.read(dest,dtype='float32');assert s==sr
 nf=math.ceil(len(w)/sr*fps);w=np.pad(w,(0,nf*1600-len(w)))
 clips.append({**row,'start':frame,'end':frame+nf,'duration':nf});audio.append((frame*1600,w));frame+=nf+7
 if i<len(rows)-1 and row['scene']!=rows[i+1]['scene']:frame+=8
frame+=40;full=np.zeros(frame*1600,np.float32)
for start,w in audio:full[start:start+len(w)]+=w
sf.write(P/'narration.wav',np.column_stack([full,full]),sr,subtype='PCM_24')
scenes=[]
for scene in dict.fromkeys(c['scene'] for c in clips):
 cs=[c for c in clips if c['scene']==scene];scenes.append({'id':scene,'title':cs[0]['title'],'start':max(0,cs[0]['start']-10),'end':cs[-1]['end']+10})
scenes[0]['start']=0
for i in range(len(scenes)-1):scenes[i]['end']=scenes[i+1]['start']
scenes[-1]['end']=frame

def split_caption(text):
 # One thought per caption; retain scientific notation and original words.
 parts=re.findall(r'[^，。？！：；]+[，。？！：；]?',text);out=[];buf=''
 for x in parts:
  if len(buf+x)>23 and buf:out.append(buf.rstrip('，。？！：；'));buf=''
  buf+=x
 if buf:out.append(buf.rstrip('，。？！：；'))
 return out
captions=[]
for c in clips:
 parts=split_caption(c['text']); words=asr.get(c['id'],{}).get('words',[]);total=sum(len(p) for p in parts)
 first=words[0]['start'] if words else .08;last=words[-1]['end'] if words else c['duration']/fps-.12
 normalize=lambda t:re.sub(r'[^\u4e00-\u9fff0-9a-z]','',t.lower())
 expected=normalize(c['text']);recognized='';wordtime=[]
 for w in words:
  text=normalize(w['word']);recognized+=text
  wordtime.extend(np.linspace(w['start'],w['end'],len(text),endpoint=False).tolist())
 pairs=[]
 for match in difflib.SequenceMatcher(None,expected,recognized).get_matching_blocks():
  for j in range(match.size):pairs.append((match.a+j,wordtime[match.b+j]))
 anchored=len(pairs)>=len(expected)*.5
 xp=[0]+[x for x,y in pairs]+[len(expected)];yp=[first]+[y for x,y in pairs]+[last]
 cursor=0
 for part in parts:
  span=len(normalize(part));begin=float(np.interp(cursor,xp,yp)) if anchored else first+(last-first)*cursor/max(1,len(expected));cursor+=span;end=float(np.interp(cursor,xp,yp)) if anchored else first+(last-first)*cursor/max(1,len(expected))
  captions.append({'text':part,'start':c['start']+round(begin*fps),'end':min(c['end'],c['start']+round(end*fps)+2),'clip':c['id']})
for i in range(len(captions)-1):captions[i]['end']=min(captions[i]['end'],captions[i+1]['start'])
timeline={'fps':30,'duration':frame,'seconds':frame/fps,'clips':clips,'captions':captions,'scenes':scenes}
for dst in [P/'timeline.json',R/'src/v3/timeline.json']:dst.write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf8')
def stamp(f):
 ms=round(f/fps*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
(D/'subtitles.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions)),encoding='utf8')
(Q/'voice-mastering.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
(Q/'timing-summary.json').write_text(json.dumps({'seconds':frame/fps,'voiceClips':len(clips),'captions':len(captions),'maxCaptionCharacters':max(len(c['text']) for c in captions),'gapSeconds':(frame-sum(c['duration'] for c in clips))/fps,'timeStretch':False,'voice':'User rainbow reference / Qwen3 local','subtitleAlignment':'Matched expected/ASR characters anchor clause splits to word timestamps; interpolate unmatched characters. Not phoneme forced alignment.'},ensure_ascii=False,indent=2),encoding='utf8')
print('Timeline',frame,'frames',frame/fps,'seconds',len(captions),'captions',flush=True)
