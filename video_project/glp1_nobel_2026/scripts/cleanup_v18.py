"""Remove the reviewed obsolete render caches only after the V18 release gate."""
from pathlib import Path
import hashlib,json,os,shutil,stat,subprocess
ROOT=Path(__file__).resolve().parents[1];ALLOWED=(ROOT/'tmp').resolve()
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
manifest=json.loads((ROOT/'delivery/latest-v18.json').read_text('utf8'))
assert manifest['releaseApproved'] and sha(ROOT/manifest['video']['path'])==manifest['video']['sha256']
lock=json.loads((ROOT/manifest['sourceLock']).read_text('utf8'))
for name,digest in lock['hashes'].items():assert sha(ROOT/name)==digest,name
plan=json.loads((ROOT/'tmp/v18-cleanup-plan.json').read_text('utf8'))
raw=subprocess.run(['powershell','-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True).stdout
processes=json.loads(raw);deleted=[];retained=[]
for item in plan['candidates']:
 p=Path(item['path'])
 assert p.is_absolute() and p!=ALLOWED and p.resolve().is_relative_to(ALLOWED)
 assert p.name in {'bundle','scale_frames','v11-frames','v15-keyframes'}
 assert 'candidate-11' not in str(p) and not any(x.startswith('v18') for x in p.relative_to(ALLOWED).parts)
 if not p.exists():retained.append({'path':str(p),'reason':'already absent'});continue
 active=[x['ProcessId'] for x in processes if str(p).lower() in (x.get('CommandLine') or '').replace('/','\\').lower()]
 if active:retained.append({'path':str(p),'reason':'referenced by active process','processIds':active});continue
 total=0
 for parent in [p,*p.parents]:
  if parent==ROOT:break
  st=parent.lstat();assert not stat.S_ISLNK(st.st_mode) and not(getattr(st,'st_file_attributes',0)&0x400)
 for base,dirs,files in os.walk(p,followlinks=False):
  assert '.git' not in dirs and '.git' not in files
  for name in dirs+files:
   q=Path(base)/name;st=q.lstat();assert not stat.S_ISLNK(st.st_mode) and not(getattr(st,'st_file_attributes',0)&0x400)
   assert q.resolve().is_relative_to(ALLOWED)
   if stat.S_ISREG(st.st_mode):total+=st.st_size
 shutil.rmtree(p)
 assert not p.exists();deleted.append({'path':str(p),'bytes':total})
for name,digest in lock['hashes'].items():assert sha(ROOT/name)==digest,name
assert sha(ROOT/manifest['video']['path'])==manifest['video']['sha256']
report={'videoSHA256':manifest['video']['sha256'],'deleted':deleted,'retained':retained,'freedBytes':sum(x['bytes'] for x in deleted),'protectedDependenciesVerified':True,'candidate11Untouched':True}
(ROOT/'tmp/v18-cleanup-executed.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'deletedDirectories':len(deleted),'freedGiB':report['freedBytes']/1024**3,'retained':len(retained)},ensure_ascii=False))
