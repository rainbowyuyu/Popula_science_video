"""Bind the measured atlas narration timeline without modifying scene source."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text('utf-8-sig'))
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
tl=read(ROOT/'public/timeline.json')
tl['draft']=False
tl['narrationRevision']='v8-parts-atlas-opening'
tl['pendingNarrationClips']=[]
tl['narrationStatus']='Current selected narration technically validated; subjective listening and pronunciation not certified'
for folder in ['public','src']:save(ROOT/folder/'timeline.json',tl)
sha=hashlib.sha256((ROOT/'public/timeline.json').read_bytes()).hexdigest()
for rel in ['audio/placements.json','research/audio-report.json','research/audio-caption-report.json']:
    path=ROOT/rel
    if not path.exists():continue
    record=read(path)
    if 'timelineSHA256' in record:record['timelineSHA256']=sha
    if 'hashes' in record:record['hashes']['timeline.json']=sha
    record['narrationDraft']=False
    save(path,record)
print('V8_TIMELINE',tl['duration'],tl['duration']/tl['fps'],'seconds',sha)
