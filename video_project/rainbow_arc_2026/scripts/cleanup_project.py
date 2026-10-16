"""Remove only validated current-project, regenerable intermediates."""
from pathlib import Path
import hashlib, json, shutil, sys
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'research/qa'
CANDIDATES=['node_modules/.cache','tmp/bundle','tmp/stills','tmp/refined','tmp/qa-shots','tmp/locked','tmp/dispersion-preview.mp4','tmp/transition-preview.mp4','tmp/transition-frames.jpg','tmp/circle-finish.mp4','tmp/original-full-render.mp4','tmp/intermediate-refinement.mp4','tmp/final-circle-check','tmp/final-refined.mp4','tmp/visual-upgrade-base.mp4','tmp/pre-visual-upgrade-final.mp4','tmp/focus-stills','tmp/upgrade-stills','tmp/visual-upgrade-stills','tmp/qwen_rainbow_transition_reference.png','tmp/qwen_rainbow_transition_reference.json','research/assets/qwen','public/audio/premaster.wav','research/audio/music-decoded.wav','research/physics/preview','research/physics/optics.mjs','research/physics/world-check.mjs']
protected=[ROOT/'src/timeline.json',ROOT/'public/audio/narration.wav',ROOT/'public/audio/music-bed.wav',ROOT/'public/audio/rainbow-arc-master.wav',ROOT/'delivery/雨后的一道弧_彩虹为什么是弧形_1080p.mp4']
def link(p):return p.is_symlink() or getattr(p,'is_junction',lambda:False)()
plan=[]
for rel in CANDIDATES:
 p=ROOT/rel
 if not p.exists():continue
 resolved=p.resolve()
 if not resolved.is_relative_to(ROOT.resolve()) or resolved==ROOT.resolve():raise RuntimeError(f'Outside project: {p}')
 if link(p):raise RuntimeError(f'Link refused: {p}')
 files=list(p.rglob('*')) if p.is_dir() else [p]
 if any(link(x) or x.name=='.git' for x in files):raise RuntimeError(f'Nested link or repository refused: {p}')
 size=sum(x.stat().st_size for x in files if x.is_file())
 plan.append({'path':rel,'bytes':size,'resolved':str(resolved)})
payload={'candidates':plan,'totalBytes':sum(x['bytes'] for x in plan),'deleted':False}
(QA/'cleanup-plan.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf8')
if '--execute' not in sys.argv:
 print(json.dumps(payload,ensure_ascii=False,indent=2));sys.exit()
report=json.loads((QA/'delivery-qa.json').read_text(encoding='utf8'))
assert report['fullDecodePassed'] and report['sourceLockUnchanged'] and not report['blackSegments']
assert (QA/'visual-review-final.md').exists()
before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
assert before[str(protected[-1])]==report['sha256']
for entry in plan:
 p=Path(entry['resolved'])
 if p.is_dir():shutil.rmtree(p)
 else:p.unlink()
for p in protected:assert p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==before[str(p)]
payload['deleted']=True;payload['protectedHashesUnchanged']=True
(QA/'cleanup-result.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf8')
print(f"Freed {payload['totalBytes']/1024**3:.3f} GiB; source, selected assets, stems and video preserved.")
