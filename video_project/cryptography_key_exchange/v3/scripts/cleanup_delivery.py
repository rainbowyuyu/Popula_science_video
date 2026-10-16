from pathlib import Path
import json,hashlib,os,stat,shutil,argparse
ROOT=Path(__file__).resolve().parents[1]
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def check(p):
 p=p.absolute();rel=p.relative_to(ROOT.absolute());q=ROOT
 for part in rel.parts:
  q=q/part;st=q.lstat()
  if stat.S_ISLNK(st.st_mode) or getattr(st,'st_file_attributes',0)&0x400:raise RuntimeError('Reparse point rejected')
 if not p.resolve().is_relative_to(ROOT.resolve()):raise RuntimeError('Outside project')
 return p
p=argparse.ArgumentParser();p.add_argument('--execute',action='store_true');a=p.parse_args()
report=ROOT/'delivery/恢复包验证.json'
# Run only after packaging and after render/browser process shutdown.
candidates=['work/bundle','work/render-temp','work/master-mux.mp4','work/mixing-motion.mp4','work/mixing-review.mp4','work/repair-6100-8040.mp4','work/repair-8460-8545.mp4','work/final-repaired.mp4']
items=[]
for name in candidates:
 path=ROOT/name
 if not path.exists():continue
 check(path);files=[]
 if path.is_dir():
  for d,dirs,names in os.walk(path,followlinks=False):
   for n in dirs:check(Path(d)/n)
   for n in names:files.append(check(Path(d)/n))
 else:files=[path]
 items.append({'path':name,'files':len(files),'bytes':sum(f.stat().st_size for f in files),'reason':'可由保留源码和母带重建的本轮临时导出或bundle'})
if a.execute:
 encoded=json.loads((ROOT/'work/qa/encoded-final.json').read_text(encoding='utf8'))
 if not encoded['passed']:raise RuntimeError('Encoded QA not passed')
 video=check(Path(encoded['video']));before=digest(video)
 if before!=encoded['sha256']:raise RuntimeError('Video changed')
 archives=list((ROOT/'delivery').glob('工程恢复包_*.zip'))
 if len(archives)!=1:raise RuntimeError('Verified unique archive required')
 validations=list((ROOT/'delivery').glob('*.verification.json'))
 if len(validations)!=1:raise RuntimeError('Package verification report missing')
 v=json.loads(validations[0].read_text(encoding='utf8'))
 if not v['allEntryCRCAndSHA256Verified'] or digest(archives[0])!=v['sha256']:raise RuntimeError('Archive verification mismatch')
 for row in items:
  path=check(ROOT/row['path'])
  if path.is_dir():shutil.rmtree(path)
  else:path.unlink()
  row['deleted']=True
 if digest(video)!=before:raise RuntimeError('Final video changed during cleanup')
result={'executed':a.execute,'releasedBytes':sum(x['bytes'] for x in items) if a.execute else 0,'items':items,'retained':['V3最终MP4/源码/模型/Blend/论文/全部raw clean母带/QA/恢复包','V2旧版回退','node_modules连接及所有共享依赖（未遍历）']}
(ROOT/'delivery/清理记录.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
