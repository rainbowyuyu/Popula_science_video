"""Adopt only inspected, published V16 native-frame transitions."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
IDS = [
    'painted_to_garden_v16', 'garden_to_drop_v16', 'drop_to_world_v16',
    'world_to_secondary_v16b', 'secondary_to_world_v16b', 'fountain_to_painted_v16c',
]
spec = json.loads((ROOT/'research/qwen-v16-art-video-specs.json').read_text('utf8'))
old = json.loads((ROOT/'src/transitions-v11.json').read_text('utf8'))
clips = [next(c for c in old['clips'] if c['id'] == 'painted_chase')]
for sid in IDS:
    shot = next(s for s in spec['shots'] if s['id'] == sid)
    folder = ROOT/'public/assets_v16/qwen'/sid
    row = json.loads((folder/'provenance.json').read_text('utf8'))
    review = json.loads((folder/'visual-acceptance.json').read_text('utf8'))
    assert row['status'] == 'processed' and review['status'] == 'pass'
    assert review['providerSHA256'] == row['providerSHA256']
    start, end = shot['plannedTimeline']['firstFrame'], shot['plannedTimeline']['lastFrame']
    assert end-start+1 == row['frameCount']
    clips.append(dict(id=sid, frames=row['frameCount'], framePath=f'assets_v16/qwen/{sid}/frames',
                      taskId=row['taskId'], anchor=dict(kind='frame',offsetFrames=start),
                      transition=dict(kind='matched',focus=[.5,.5],enterFrames=1,
                                      exitFrames=1,overlapFrames=0,maxBlurPx=0)))
result = dict(version='V16',fps=30,strategy='Frozen V16 scene endpoints; six reviewed native Qwen transitions plus preserved painted opening. Rejected variants excluded.',clips=clips)
(ROOT/'src/transitions-v11.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
print('Integrated',len(clips),'native-frame clips; all V16 assets have matching visual acceptance.')
