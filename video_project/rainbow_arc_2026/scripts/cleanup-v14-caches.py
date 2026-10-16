"""Plan-only by default; QA-gated V14 regenerable cache deletion, never assets.

Only ordinary files beneath explicit V14 output/local work cache classes can
be selected. Junctions are inspected but never followed or recursively removed.
The final complete bundle must be explicitly supplied and remains protected.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, re, shutil, stat, subprocess, sys, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
_OUTPUT_LOCATOR=Path(json.loads((ROOT/'work/output-root-v14.json').read_text('utf8'))['outputRoot'])
OUT=Path(os.path.abspath(_OUTPUT_LOCATOR if _OUTPUT_LOCATOR.is_absolute() else ROOT/_OUTPUT_LOCATOR))
REPORT=ROOT/'work/package-v14';CHUNK=4*1024*1024
BLOCKED={'public','node_modules','src','scripts','research','qwen-v14','opus-runs','environment-v14','package-v14','.git','.claude','.codex','.agents','__pycache__'}
def jd(v):return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf8')
def load(p):return json.loads(Path(p).read_text('utf8'))
def reparse(p):
 s=p.lstat();return stat.S_ISLNK(s.st_mode) or bool(getattr(s,'st_file_attributes',0)&0x400)
def absolute(p):return Path(os.path.abspath(p))
def ancestors_safe(p):
 p=absolute(p)
 for x in [p,*p.parents]:
  if x.exists() and reparse(x):raise RuntimeError('Link/reparse path refused: '+str(p))
 return p
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(CHUNK),b''):h.update(b)
 return h.hexdigest()
def statrow(p):
 s=p.stat();return {'bytes':s.st_size,'mtime_ns':s.st_mtime_ns,'hardLinkCount':s.st_nlink}
def check_context():
 if ROOT.name!='rainbow_arc_2026_v14' or OUT.name!='rainbow_arc_v14':raise RuntimeError('Unexpected V14 project/output roots')
 ancestors_safe(ROOT);ancestors_safe(OUT)
def target_roots(keep):
 rows=[]
 for parent in [OUT/'work',ROOT/'work']:
  if not parent.is_dir():continue
  for p in sorted(parent.iterdir()):
   if reparse(p):continue
   if p.is_dir() and re.fullmatch(r'bundle(?:-\d+)?',p.name):rows.append({'path':str(p),'kind':'bundle'})
   elif p.is_dir() and re.fullmatch(r'(?:stills-v14(?:-[A-Za-z0-9_-]+)?|preview-v14(?:-[A-Za-z0-9_-]+)?|render-tmp-v14)',p.name):rows.append({'path':str(p),'kind':'preview-or-render-temp'})
   elif p.is_file() and re.fullmatch(r'preview[-_A-Za-z0-9]*v14[-_A-Za-z0-9]*\.(?:mp4|mov|webm)',p.name,re.I):rows.append({'path':str(p),'kind':'preview-file'})
 editorial=ROOT/'work/editorial-v14/bundle'
 if editorial.is_dir() and not reparse(editorial):rows.append({'path':str(editorial),'kind':'bundle'})
 # Without an explicit final locator, external bundles are all protected.
 protected=[Path(r['path']) for r in rows if r['kind']=='bundle' and Path(r['path']).parent==OUT/'work'] if keep is None else [keep]
 return [r for r in rows if Path(r['path']) not in protected],protected
def checked(p,roots,protected):
 p=absolute(p)
 # Re-establish the lexical allowlist independently of the saved JSON plan.
 # A modified plan cannot authorize an arbitrary sibling/shared directory.
 cache_roots=[OUT/'work',ROOT/'work'];relative=next((p.relative_to(r) for r in cache_roots if p.is_relative_to(r) and p!=r),None)
 if relative is None:raise RuntimeError('Outside actual V14 work roots')
 top=relative.parts[0]
 ordinary=bool(re.fullmatch(r'bundle(?:-\d+)?|stills-v14(?:-[A-Za-z0-9_-]+)?|preview-v14(?:-[A-Za-z0-9_-]+)?|render-tmp-v14',top))
 preview_file=len(relative.parts)==1 and bool(re.fullmatch(r'preview[-_A-Za-z0-9]*v14[-_A-Za-z0-9]*\.(?:mp4|mov|webm)',top,re.I))
 editorial=p.is_relative_to(ROOT/'work/editorial-v14/bundle')
 if not (ordinary or preview_file or editorial):raise RuntimeError('Path is not an independently allowlisted V14 cache class')
 if any(part.casefold() in BLOCKED for part in relative.parts):raise RuntimeError('Source/dependency subtree is protected')
 if not any(p==r or p.is_relative_to(r) for r in roots):raise RuntimeError('Outside explicit V14 regenerable cache target')
 if any(p==k or p.is_relative_to(k) for k in protected):raise RuntimeError('Final V14 bundle is protected')
 if p.is_relative_to(ROOT/'public') or p.is_relative_to(OUT/'delivery'):raise RuntimeError('Source/final media protected')
 ancestors_safe(p)
 return p
def plan(keep):
 check_context()
 if keep is not None:
  keep=ancestors_safe(keep)
  if keep.parent!=OUT/'work' or not re.fullmatch(r'bundle-\d+',keep.name) or not keep.is_dir():raise RuntimeError('Keep bundle must be a complete ordinary V14 output/work bundle directory')
 targets,protected=target_roots(keep);roots=[Path(r['path']) for r in targets];rows=[];skipped=[];stats=[]
 for target in targets:
  base=Path(target['path']);before=len(rows);raw=0
  if base.is_file():found=[base]
  else:
   found=[]
   for folder,dirs,names in os.walk(base,followlinks=False):
    b=Path(folder)
    for n in dirs[:]:
     p=b/n
     if reparse(p) or n.casefold() in BLOCKED:
      skipped.append({'path':str(p),'reason':'Reparse/source/dependency directory retained; never followed'});dirs.remove(n)
    found.extend(b/n for n in names)
  for p in found:
   if reparse(p):skipped.append({'path':str(p),'reason':'Reparse entry retained; never followed'});continue
   checked(p,roots,protected);s=statrow(p);raw+=s['bytes'];rel=p.relative_to(base) if base.is_dir() else Path(p.name)
   if s['hardLinkCount']!=1:skipped.append({'path':str(p),'reason':'Hard-linked file retained'});continue
   if target['kind']=='bundle':
    allowed=len(rel.parts)==1 and (re.fullmatch(r'(?:\d+\.)?bundle\.js(?:\.map)?',p.name) or p.name in {'index.html','favicon.ico'})
   elif target['kind']=='preview-file':allowed=True
   else:allowed=p.suffix.lower() in {'.png','.jpg','.jpeg','.mp4','.mov','.webm','.aac','.m4a','.wav','.log'}
   if not allowed:skipped.append({'path':str(p),'reason':'Unknown file class retained'});continue
   rows.append({'path':str(p),'target':target['path'],'kind':target['kind'],**s,'sha256':sha(p),'rebuild':'Re-render from preserved V14 source, locked dependencies, original media and verified recovery ZIP.'})
  stats.append({'root':str(base),'kind':target['kind'],'ordinaryBytes':raw,'eligibleFiles':len(rows)-before})
 return {'version':'V14','status':'planned-not-applied','createdUTC':dt.datetime.now(dt.timezone.utc).isoformat(),'toolSHA256':sha(Path(__file__)),'projectRoot':str(ROOT),'outputRoot':str(OUT),'targets':targets,'roots':stats,'keepBundleExplicit':keep is not None,'protectedBundles':[str(x) for x in protected],'protectedPaths':[str(ROOT/'public'),str(ROOT/'node_modules'),str(ROOT/'src'),str(ROOT/'scripts'),str(ROOT/'research'),str(ROOT/'work/qwen-v14'),str(ROOT/'work/opus-runs'),str(OUT/'work/qwen-v14'),str(OUT/'delivery'),str(OUT.parent/'rainbow_arc_v13'),str(ROOT.parent/'rainbow_arc_2026_v13'),str(OUT.parent/'rainbow_arc_v12'),str(ROOT.parent/'rainbow_arc_2026_v12')],'candidates':rows,'candidateFiles':len(rows),'candidateBytes':sum(r['bytes'] for r in rows),'skipped':skipped,'freeBefore':{'local':shutil.disk_usage(ROOT).free,'output':shutil.disk_usage(OUT).free},'deletedFiles':0,'linkTargetsTouched':False}
def active_guard():
 if os.name!='nt':return
 r=subprocess.run(['powershell','-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
 data=json.loads(r.stdout or '[]')
 for row in data if isinstance(data,list) else [data]:
  if row.get('ProcessId')==os.getpid():continue
  if (row.get('Name') or '').lower() in {'node.exe','chrome.exe','chrome-headless-shell.exe','blender.exe'} and re.search(r'\brender-v14\.mjs\b|rainbow_arc_2026_v14.*render-tmp-v14',row.get('CommandLine') or '',re.I):raise RuntimeError('Active V14 cache producer/consumer PID '+str(row['ProcessId'])+'; command omitted')
def gate(qa_path,result_path,p):
 qa=load(qa_path);final=OUT/'delivery/彩虹为什么是弧形_V14_1080p.mp4'
 if qa.get('version')!='V14' or qa.get('status')!='pass' or qa.get('passed') is not True or qa.get('errors')!=[] or qa.get('visualReviewApproved') is not True or qa.get('encodedFullDecodePassed') is not True:raise RuntimeError('Exact passing final V14 technical QA and actual visual approval required')
 formal=ROOT/'research/qa-v14/delivery-qa-v14.json'
 if not formal.is_file() or sha(formal)!=sha(Path(qa_path)):raise RuntimeError('Cleanup approval must be the exact current formal V14 completed-delivery QA')
 if sha(final)!=qa.get('videoSHA256'):raise RuntimeError('Final movie is not the approved V14 hash')
 result=load(result_path);archive=Path(result['archive'])
 if result.get('version')!='V14' or result.get('status')!='verified' or not result.get('verification',{}).get('allMemberSHA256Passed') or sha(archive)!=result.get('sha256'):raise RuntimeError('Verified V14 recovery package required')
 with zipfile.ZipFile(archive) as z:
  if z.testzip() is not None:raise RuntimeError('Recovery ZIP CRC failed')
  manifest=json.loads(z.read('manifest-v14.json'))
  if manifest.get('version')!='V14' or manifest.get('status')!='QA-approved-recovery-manifest' or manifest.get('acceptedVideo',{}).get('sha256')!=qa['videoSHA256']:raise RuntimeError('Recovery manifest does not bind the approved final movie')
  if not result.get('verification',{}).get('testzipPassed'):raise RuntimeError('Recovery verification incomplete')
  entries=manifest.get('entries',[])
  names=z.namelist()
  if len(names)!=len(set(names)) or set(names)!={r['member'] for r in entries}|{'manifest-v14.json'}:raise RuntimeError('Recovery member set differs from the verified inventory')
  for item in manifest['entries']:
   h=hashlib.sha256();size=0
   with z.open(item['member']) as stream:
    for b in iter(lambda:stream.read(CHUNK),b''):h.update(b);size+=len(b)
   if h.hexdigest()!=item['sha256'] or size!=item['bytes']:raise RuntimeError('Recovery member hash failed: '+item['member'])
 if p.get('keepBundleExplicit') is not True:raise RuntimeError('Plan must explicitly protect the final complete --keep-bundle')
 render=load(ROOT/'research/qa-v14/render-start-v14.json')
 if render.get('version')!='V14' or render.get('status')!='completed' or render.get('videoSHA256')!=qa['videoSHA256']:raise RuntimeError('Current completed render record missing')
 if len(p['protectedBundles'])!=1 or absolute(p['protectedBundles'][0])!=absolute(render['bundleDir']):raise RuntimeError('Explicit protected bundle is not the actual approved final render bundle')
 for k in p['protectedBundles']:
  protected=ancestors_safe(k)
  if not protected.is_dir() or not (protected/'bundle.js').is_file() or sha(protected/'bundle.js')!=render.get('bundleEntrySHA256'):raise RuntimeError('Protected final bundle missing or changed')
 audit_path=ROOT/'research/qa-v14/audit-v14.json';audit=load(audit_path)
 if qa.get('sourceAudit',{}).get('sha256')!=sha(audit_path) or audit.get('version')!='V14' or audit.get('passed') is not True or audit.get('errors')!=[] or render.get('sourceAuditSHA256')!=sha(audit_path):raise RuntimeError('Final QA/render do not bind the current passing V14 source audit')
 for item in audit['sourceHashes']+audit.get('assets',{}).get('staticAssetHashes',[]):
  if sha(ROOT/item['file'])!=item['sha256']:raise RuntimeError('Protected current input/source changed')
 rollbacks=[]
 for version in ['V13','V12']:
  rollback=OUT.parent/('rainbow_arc_'+version.lower())/'delivery'/('彩虹为什么是弧形_'+version+'_1080p.mp4')
  if not rollback.is_file():raise RuntimeError('Required '+version+' rollback movie missing')
  rollbacks.append((rollback,sha(rollback)))
 return final,qa['videoSHA256'],rollbacks
def apply(p,qa,result):
 check_context()
 if p.get('version')!='V14' or p.get('status')!='planned-not-applied' or p.get('toolSHA256')!=sha(Path(__file__)):raise RuntimeError('Stale or invalid cleanup plan')
 if p.get('projectRoot')!=str(ROOT) or p.get('outputRoot')!=str(OUT):raise RuntimeError('Plan belongs to another project/output')
 active_guard();final,digest,rollbacks=gate(qa,result,p);roots=[Path(r['path']) for r in p['targets']];protected=[Path(x) for x in p['protectedBundles']]
 # Exact snapshots for EVERY ordinary candidate before the first mutation.
 for row in p['candidates']:
  file=checked(row['path'],roots,protected)
  if not file.is_file() or statrow(file)!={k:row[k] for k in ['bytes','mtime_ns','hardLinkCount']} or sha(file)!=row['sha256']:raise RuntimeError('Cleanup candidate changed after planning')
 deleted=0;total=0;stamp=dt.datetime.now().strftime('%Y%m%d-%H%M%S');log=REPORT/f'cleanup-v14-{stamp}.deleted.jsonl'
 with log.open('x',encoding='utf8') as stream:
  for row in p['candidates']:
   file=checked(row['path'],roots,protected)
   if statrow(file)!={k:row[k] for k in ['bytes','mtime_ns','hardLinkCount']} or sha(file)!=row['sha256']:raise RuntimeError('Candidate changed immediately before deletion')
   file.unlink();deleted+=1;total+=row['bytes'];stream.write(json.dumps({'path':str(file),'bytes':row['bytes'],'sha256':row['sha256'],'deletedUTC':dt.datetime.now(dt.timezone.utc).isoformat()},ensure_ascii=False)+'\n');stream.flush()
 # Do not recursively remove a directory or unlink any reparse entry. Empty
 # ordinary folders are removable; linked public folders remain untouched.
 for root in roots:
  if not root.is_dir():continue
  folders=[]
  for folder,dirs,names in os.walk(root,followlinks=False):
   b=Path(folder);dirs[:]=[n for n in dirs if not reparse(b/n) and n.casefold() not in BLOCKED];folders.append(b)
  for b in reversed(folders):
   try:checked(b,roots,protected);b.rmdir()
   except OSError:pass
 if sha(final)!=digest or any(sha(file)!=old_digest for file,old_digest in rollbacks):raise RuntimeError('Protected final/V13/V12 rollback media changed')
 outcome={**p,'status':'applied','deletedFiles':deleted,'logicalBytesRemoved':total,'freeAfter':{'local':shutil.disk_usage(ROOT).free,'output':shutil.disk_usage(OUT).free},'movieHashesRechecked':True,'deletionLog':str(log),'linkTargetsTouched':False};(REPORT/'cleanup-result-v14.json').write_bytes(jd(outcome));return outcome
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('mode',choices=['plan','apply'],nargs='?',default='plan');parser.add_argument('--keep-bundle',type=Path);parser.add_argument('--qa',type=Path);parser.add_argument('--package-result',type=Path);args=parser.parse_args();REPORT.mkdir(parents=True,exist_ok=True);plan_path=REPORT/'cleanup-plan-v14.json'
 if args.mode=='plan':outcome=plan(args.keep_bundle);plan_path.write_bytes(jd(outcome))
 else:
  if not args.qa or not args.package_result:parser.error('apply needs --qa and --package-result')
  outcome=apply(load(plan_path),args.qa,args.package_result)
 print(json.dumps({k:outcome[k] for k in ['version','status','candidateFiles','candidateBytes','deletedFiles','keepBundleExplicit','protectedBundles','linkTargetsTouched']},ensure_ascii=False,indent=2));print('Plan: '+str(plan_path))
if __name__=='__main__':
 try:main()
 except Exception as exc:print('CLEANUP_V14_REJECTED: '+str(exc),file=sys.stderr);sys.exit(1)
