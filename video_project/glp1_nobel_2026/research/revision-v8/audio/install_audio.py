"""Install the locked V8 audio only. Does not rebuild/overwrite the timeline.

Without --install prints a validated file plan. Uses atomic replacements and
cheap same-volume hard-link backups so prior sources remain recoverable.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,os,shutil,tempfile
BASE=Path(__file__).resolve().parent;ROOT=BASE.parents[2]
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
 return h.hexdigest()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--install',action='store_true');a=ap.parse_args()
 report=read(BASE/'music-final/audio-candidate-report.json');staged=BASE/'staged';tl=read(staged/'timeline.json')
 assert sha(ROOT/'src/timeline.json')==report['timelineSHA256']==sha(staged/'timeline.json'),'Installed visual timeline must exactly match frozen V8 timeline'
 assert sha(ROOT/'docs/story-v8.json')==report['storySHA256']==tl['storySHA256']
 for path,digest in report['lockedStagedInputs'].items():assert sha(ROOT/path)==digest
 tasks=[(staged/'narration.wav',ROOT/'public/narration.wav'),(BASE/'music-final/music.wav',ROOT/'public/music.wav'),(BASE/'music-final/master.wav',ROOT/'public/master.wav')]
 tasks.extend((staged/'voice'/f"{c['id']}.wav",ROOT/'public/voice'/f"{c['id']}.wav") for c in tl['clips'])
 rows=[]
 for source,target in tasks:
  digest=sha(source)
  if source.parent.name=='music-final':assert digest==report['hashes'][source.name]
  rows.append({'source':str(source),'target':str(target),'sha256':digest,'previousSHA256':sha(target) if target.exists() else None})
 if not a.install:
  print(json.dumps({'validated':True,'writes':False,'fileCount':len(rows),'changedCount':sum(r['sha256']!=r['previousSHA256'] for r in rows),'timelineSHA256':report['timelineSHA256'],'masterSHA256':report['hashes']['master.wav'],'files':rows},ensure_ascii=False,indent=2));return
 manifest=BASE/'installation.json';assert not manifest.exists(),'Installation already recorded; inspect it rather than overwrite'
 backup=BASE/'production-before-v8'
 for row in rows:
  source=Path(row['source']);target=Path(row['target']);target.parent.mkdir(parents=True,exist_ok=True)
  if row['sha256']==row['previousSHA256']:row['unchanged']=True;continue
  if target.exists():
   prior=backup/target.relative_to(ROOT/'public');prior.parent.mkdir(parents=True,exist_ok=True)
   if prior.exists():assert sha(prior)==row['previousSHA256']
   else:
    try:os.link(target,prior);row['backupMethod']='hard-link'
    except OSError:shutil.copyfile(target,prior);row['backupMethod']='copy'
   row['backup']=str(prior)
  fd,name=tempfile.mkstemp(prefix='.v8-',suffix='.wav',dir=target.parent);os.close(fd);tmp=Path(name)
  try:
   shutil.copyfile(source,tmp);assert sha(tmp)==row['sha256'];os.replace(tmp,target)
  finally:
   if tmp.exists():tmp.unlink()
  assert sha(target)==row['sha256']
 assert sha(ROOT/'src/timeline.json')==report['timelineSHA256']
 protected_paths=sorted({p for folder in [ROOT/'src',ROOT/'public'] for p in folder.rglob('*') if p.is_file()}|{ROOT/'docs/story-v8.json'})
 protected={p.relative_to(ROOT).as_posix():sha(p) for p in protected_paths}
 result={'createdUTC':datetime.now(timezone.utc).isoformat(),'installed':True,'timelineWasNotWritten':True,'timelineSHA256':report['timelineSHA256'],'storySHA256':report['storySHA256'],'durationFrames':tl['durationFrames'],'filesInstalled':rows,'protectedFilesAfter':protected,'sourceFreezeScope':'Every src and public file plus docs/story-v8.json; content-addressed freeze, no OS read-only flags','subjectiveListeningCompleted':False}
 manifest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'installed':True,'files':len(rows),'manifest':str(manifest),'masterSHA256':report['hashes']['master.wav']},ensure_ascii=False))
if __name__=='__main__':main()
