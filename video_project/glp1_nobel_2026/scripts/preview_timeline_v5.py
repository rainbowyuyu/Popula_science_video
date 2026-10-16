import json,math
from pathlib import Path
P=Path(__file__).resolve().parents[1]
s=json.loads((P/'docs/story-v5.json').read_text(encoding='utf-8'))
f=0;clips=[];captions=[]
for c in s['shots']:
 d=round((len(c['text'])/4.0+.5)*30);clips.append(dict(c,start=f,end=f+d,duration=d))
 parts=c['text'].replace('；','，').replace('：','，').replace('？','。').split('。')
 parts=[a for p in parts for a in p.split('，') if a]
 total=sum(map(len,parts));cursor=f
 for i,p in enumerate(parts):
  end=f+d if i==len(parts)-1 else cursor+round(d*len(p)/total)
  captions.append(dict(text=p,start=cursor,end=end));cursor=end
 f+=d
t=dict(fps=30,duration=f+360,clips=clips,sections=[dict(id='journey',start=0,end=f+360)],captions=captions,revision='v5-visual-preview-estimated-NOT-FINAL')
(P/'src/timeline.json').write_text(json.dumps(t,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'clips':len(clips),'estimatedDuration':t['duration']/30,'notice':'Silent visual preview only, final timeline must use measured TTS.'}))
