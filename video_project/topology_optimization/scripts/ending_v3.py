"""Append a five-second method coda; keep original narration samples unchanged."""
from pathlib import Path
import json
import numpy as np
import soundfile as sf
R=Path(__file__).resolve().parents[1]
for rel in ['src/v3/timeline.json','public/v3/timeline.json']:
 p=R/rel;t=json.loads(p.read_text('utf8'))
 if not any(s['id']=='references' for s in t['scenes']):
  start=t['duration'];t['scenes'].append({'id':'references','title':'形状背后的计算','start':start,'end':start+150})
  t['duration']+=150;t['seconds']=t['duration']/30
 p.write_text(json.dumps(t,ensure_ascii=False,indent=2),encoding='utf8')
p=R/'public/v3/narration.wav';a,sr=sf.read(p,always_2d=True);target=t['duration']*sr//30
if len(a)<target:sf.write(p,np.pad(a,((0,target-len(a)),(0,0))),sr,subtype='PCM_24')
print('Timeline:',t['seconds'],'seconds; coda:',150,'frames')
