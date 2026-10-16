"""Provisional visual layout timing; never used as final voice timing."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
story=json.loads((ROOT/'research/story.json').read_text('utf8'))
clips=[];captions=[];scenes=[];t=0;estimated=[]
for row in story['clips']:
    path=ROOT/'research/audio/takes'/f"{row['id']}.json"
    meta=json.loads(path.read_text('utf8')) if path.exists() else {}
    valid=meta.get('version')=='V06-protected-broadcast' and meta.get('text')==row['spoken']
    duration=float(meta['duration']) if valid else max(4.3,len(re.sub(r'[^\u4e00-\u9fff0-9A-Za-z]','',row['spoken']))/5.2+.24)
    if not valid:estimated.append(row['id'])
    clips.append({**row,'start':t,'end':t+duration,'duration':duration})
    if not scenes or scenes[-1]['id']!=row['scene']:
        if scenes:scenes[-1]['end']=t
        scenes.append({'id':row['scene'],'start':t,'end':t+duration})
    parts=[]
    for p in re.split(r'[，。；？！、：]',row['text']):
        if not p:continue
        parts.extend(p[i:i+20] for i in range(0,len(p),20))
    n=sum(map(len,parts));tt=t+.08
    for p in parts:
        end=tt+(duration-.24)*len(p)/n
        captions.append({'text':p,'start':tt,'end':end});tt=end
    t+=duration+.12
scenes[-1]['end']=t
scenes.append({'id':'references','start':t,'end':t+5})
data={'fps':30,'duration':round((t+5)*30),'seconds':round((t+5)*30)/30,'clips':clips,'captions':captions,'scenes':scenes,'notFinal':True,'estimatedClipIds':estimated}
(ROOT/'src/timeline.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf8')
print({'seconds':data['seconds'],'measuredClips':len(clips)-len(estimated),'estimated':estimated})
