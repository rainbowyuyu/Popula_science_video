"""Remove only named, regenerable intermediates after verified delivery."""
from pathlib import Path
import hashlib, json, os, shutil, stat

R=Path(__file__).resolve().parents[1]
P=R.parents[1].resolve()
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def is_link(p):
 s=p.lstat()
 return stat.S_ISLNK(s.st_mode) or bool(getattr(s,'st_file_attributes',0)&0x400)
def inventory(p):
 if is_link(p):raise RuntimeError(f'Refusing link: {p}')
 if not p.resolve().is_relative_to(P):raise RuntimeError(f'Outside project: {p}')
 if p.is_file():return [p]
 result=[]
 with os.scandir(p) as entries:
  for e in entries:result.extend(inventory(Path(e.path)))
 return result

qa=json.loads((R/'work/qa/final-video.json').read_text(encoding='utf8'))
movie=P/'output/v05/Roadster_倒挂与飞行翻滚_1080p.mp4'
assert qa['automaticChecksPassed'] and sha(movie)==qa['videoSha256']
archive=P/'output/v05/Roadster_v05_可恢复源码.zip'
expected=(archive.with_suffix('.zip.sha256')).read_text(encoding='utf8').split()[0]
assert sha(archive)==expected, 'Verified recovery archive required'
targets=['work/bundle','work/bundle-patch','work/render-temp','work/audio/processing','work/audio/prior','work/audio/protected','work/audio/music-analysis.wav','work/audio/music-source-decoded.wav','work/audio/music-arranged.wav','work/audio/narration.wav','work/intro-review.mp4','work/intro-review-audio.mp4','work/label-repair.mp4','work/roadster-before-label-fix.mp4','work/label-repaired-master.mp4']
review=[]
for rel in targets:
 p=R/rel
 if not p.exists():continue
 files=inventory(p)
 review.append({'path':p.relative_to(P).as_posix(),'files':len(files),'bytes':sum(f.stat().st_size for f in files),'reason':'Regenerable render/cache or superseded intermediate; final master, raw/clean narration, source, QA and recovery archive retained'})
for row in review:
 p=P/row['path']
 inventory(p)
 if p.is_dir():shutil.rmtree(p)
 else:p.unlink()
 row['deleted']=not p.exists()
assert sha(movie)==qa['videoSha256']
for row in json.loads((R/'work/qa/render-inputs.json').read_text(encoding='utf8'))['inputs']:
 assert sha(R/row['path'])==row['sha256']
report={'scope':str(P),'recoveryArchive':archive.relative_to(P).as_posix(),'finalMasterUnchanged':True,'inputHashesUnchanged':True,'deleted':review,'bytesFreed':sum(x['bytes'] for x in review if x['deleted']),'kept':['Final MP4, SRT and narration script','Current src/public/package lock','Original and cleaned narration cues','Current canonical GLB and model source','Research and visual/encoded QA evidence','Previous output/v04 full movie and source','Shared node_modules junction untouched'],'meaning':'Disk bytes only; not a measurement of RAM/VRAM freed'}
(P/'output/v05/cleanup.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'bytesFreed':report['bytesFreed'],'paths':len(review),'finalMasterUnchanged':True}))
