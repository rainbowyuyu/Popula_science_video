"""Remove only episode-local regenerable work after encode and recovery verification."""
from pathlib import Path
import json,hashlib,stat,shutil,sys
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'research/qa'
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
 return h.hexdigest()
def reparse(p):
 s=p.lstat();return stat.S_ISLNK(s.st_mode) or bool(getattr(s,'st_file_attributes',0)&0x400)
def safe(p):
 p.relative_to(ROOT)
 cur=ROOT
 for part in p.relative_to(ROOT).parts:
  cur=cur/part
  if cur.exists() and reparse(cur):raise RuntimeError('Refusing reparse point: '+str(cur))
 return p
def files(p):
 safe(p)
 if p.is_dir():
  if (p/'.git').exists():raise RuntimeError('Refusing nested repository')
  for c in p.iterdir():yield from files(c)
 elif p.is_file():yield p
qa=json.loads((QA/'delivery-qa-v07.json').read_text('utf8'))
assert qa['fullDecodePassed'] and qa['sourceLockUnchanged'] and not qa['blackSegments'] and not qa['silenceSegmentsOver1_5s']
zip_reports=list((ROOT/'delivery').glob('*V07*.crc-report.json'))
assert len(zip_reports)==1,'One verified V07 recovery package required'
zr=json.loads(zip_reports[0].read_text('utf8'))
assert zr['all_crc_passed'] and zr['all_sha256_passed']
assert digest(ROOT/'delivery'/zr['zip'])==zr['sha256']
lock=json.loads((QA/'render-source-lock-v07.json').read_text('utf8'))['files']
candidates=['tmp','work/benchmark-v07.mp4','work/preview-reflection-v07.mp4','work/preview-reflection-fixed-v07.mp4','work/retired-before-label-fix-v07.mp4','work/v07-quality-reflection-bundle',
 'research/qa/v07-first-stills','research/qa/v07-refined-stills','research/qa/v07-studio-stills','research/qa/v07-final-light-stills']
candidates+= [p.relative_to(ROOT).as_posix() for p in QA.glob('*v07*.bundle.mjs')]
items=[]
for rel in candidates:
 p=safe(ROOT/rel)
 if not p.exists():continue
 rows=list(files(p))
 assert all(r.relative_to(ROOT).as_posix() not in lock for r in rows)
 items.append({'path':rel,'files':len(rows),'bytes':sum(r.stat().st_size for r in rows)})
report={'version':'V07','dryRun':'--apply' not in sys.argv,'candidates':items,'totalBytes':sum(i['bytes'] for i in items),
 'preserved':['V06 delivery','V07 sources and render assets','raw Lux3D PLY and GLB','Qwen originals and provenance','Blender sources','voice takes','Opus run and failure report','final lock and encoded visual QA']}
(QA/'cleanup-v07.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
if '--apply' in sys.argv:
 for i in items:
  p=safe(ROOT/i['path']);list(files(p))
  if p.is_dir():shutil.rmtree(p)
  else:p.unlink()
 assert digest(ROOT/qa['video'])==qa['sha256']
 assert all((ROOT/rel).is_file() and digest(ROOT/rel)==data['sha256'] for rel,data in lock.items())
 report['applied']=True;report['dependencyHashesUnchanged']=True
 (QA/'cleanup-v07.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({k:v for k,v in report.items() if k!='candidates'},ensure_ascii=False,indent=2))
