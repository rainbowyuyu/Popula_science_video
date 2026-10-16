import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
story=json.loads((root/'src'/'beso-story-compact.json').read_text(encoding='utf-8'))
caps=json.loads((root/'src'/'beso-captions-compact.json').read_text(encoding='utf-8'))
fps=story['fps']
out=[]
for scene in story['scenes']:
    for clip in scene['clips']:
        cid=clip['id']
        group=[c for c in caps if c.get('sourceCaption','').startswith(cid+'-c')]
        if not group:
            group=[{'text':clip['text'],'startMs':0,'endMs':round(clip['frames']/fps*1000),'sourceCaption':cid+'-c0'}]
        old0=min(c['startMs'] for c in group)
        new0=round((scene['start']+clip['from'])/fps*1000)
        for c in group:
            out.append({'id':'compact-'+c['sourceCaption'],'text':c['text'],'startMs':new0+(c['startMs']-old0),'endMs':new0+(c['endMs']-old0),'sourceCaption':c['sourceCaption']})
out.sort(key=lambda c:c['startMs'])
(root/'src'/'beso-captions-compact.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('captions',len(out),'durationMs',max(c['endMs'] for c in out))
