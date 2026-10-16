"""Record the authorized h068/h088 camera-only repair without changing audio.

Requires the final camera SHA from the camera owner. Every other frozen source
must match before the revision is accepted; prior manifests remain immutable.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,shutil
BASE=Path(__file__).resolve().parent;ROOT=BASE.parents[2];CAMERA='src/V5CameraPath.ts'
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--camera-sha',required=True);ap.add_argument('--report',required=True);a=ap.parse_args()
 installation=BASE/'installation.json';lock=BASE/'final-lock.json';i=read(installation);l=read(lock)
 old_install_sha=sha(installation);old_lock_sha=sha(lock);old_camera=i['protectedFilesAfter'][CAMERA];new_camera=sha(ROOT/CAMERA)
 assert old_install_sha==l['installationSHA256'],'Existing lock reference differs from manifest'
 assert new_camera==a.camera_sha.lower(),'Camera changed since final framing review'
 assert old_camera!=new_camera,'There is no new camera source to freeze'
 other_differences=[p for p,h in i['protectedFilesAfter'].items() if p!=CAMERA and sha(ROOT/p)!=h]
 assert not other_differences,'Unapproved non-camera changes: '+str(other_differences)
 reportpath=Path(a.report);reportpath=reportpath if reportpath.is_absolute() else ROOT/reportpath
 assert reportpath.is_file(),'Final framing review report must exist'
 backup=BASE/'freeze-before-h068-h088-camera-fix';backup.mkdir(exist_ok=False)
 for p in [installation,lock,BASE/'final-notes.md']:shutil.copyfile(p,backup/p.name)
 revision={'createdUTC':datetime.now(timezone.utc).isoformat(),'reason':'Parent authorized repair of actual h068/h088 standing-camera head clipping after cancelling the prior partial render.','changedSource':CAMERA,'previousSHA256':old_camera,'finalSHA256':new_camera,'reviewReport':str(reportpath.relative_to(ROOT)),'reviewReportSHA256':sha(reportpath),'previousInstallationSHA256':old_install_sha,'previousFinalLockSHA256':old_lock_sha,'priorFreezePreservedIn':str(backup.relative_to(ROOT)),'unchangedOtherProtectedFileCount':len(i['protectedFilesAfter'])-1,'audioNarrationTimelineStoryUnchanged':True,'finalVideoTarget':'tmp/v8-full-corrected/GLP1_V8_1080p.mp4'}
 i['protectedFilesAfter'][CAMERA]=new_camera;i.setdefault('sourceFreezeRevisions',[]).append(revision);save(installation,i)
 l['installationSHA256']=sha(installation);l['cameraFramingRevision']=revision;save(lock,l);save(BASE/'camera-freeze-revision.json',revision)
 notes=BASE/'final-notes.md';s=notes.read_text(encoding='utf8');s+='\n## Authorized camera-only freeze revision\n\nThe interrupted partial render exposed head clipping while the character stands in h068 and h088. After the camera owner completed the final framing check, only `src/V5CameraPath.ts` was re-frozen: `'+old_camera+'` → `'+new_camera+'`. Every other protected file ('+str(len(i['protectedFilesAfter'])-1)+') matched the prior freeze, including narration, music, master, timeline and story. The former manifests and notes are preserved in `freeze-before-h068-h088-camera-fix`; the exact revision is `camera-freeze-revision.json`. Final video target: `tmp/v8-full-corrected/GLP1_V8_1080p.mp4`.\n';notes.write_text(s,encoding='utf8')
 print(json.dumps({'cameraFreezeUpdated':True,'cameraSHA256':new_camera,'otherProtectedFilesUnchanged':len(i['protectedFilesAfter'])-1,'installationSHA256':l['installationSHA256'],'masterSHA256':l['masterSHA256']},ensure_ascii=False))
if __name__=='__main__':main()
