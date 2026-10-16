"""State whether the current audio timeline is a review intermediate or final script."""
from pathlib import Path
import argparse,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--draft',action='store_true');args=ap.parse_args()
def read(p):return json.loads(p.read_text('utf-8-sig'))
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
tl=read(ROOT/'public/timeline.json');tl['draft']=args.draft
tl['narrationRevision']='v7-engineering-flow'
tl['pendingNarrationClips']=['s029','s030','s031','s032'] if args.draft else []
tl['narrationStatus']='review: old wind narration temporarily retained pending accepted CFD' if args.draft else 'current narrated source validated; subjective listening not certified'
for folder in ['public','src']:save(ROOT/folder/'timeline.json',tl)
sha=hashlib.sha256((ROOT/'public/timeline.json').read_bytes()).hexdigest()
for path in ['audio/placements.json','research/audio-report.json','research/audio-caption-report.json']:
 p=ROOT/path
 if not p.exists():continue
 v=read(p)
 if 'timelineSHA256' in v:v['timelineSHA256']=sha
 if 'hashes' in v:v['hashes']['timeline.json']=sha
 v['narrationDraft']=args.draft
 save(p,v)
print('Timeline',tl['duration'],'frames',tl['duration']/tl['fps'],'seconds; draft',args.draft)
