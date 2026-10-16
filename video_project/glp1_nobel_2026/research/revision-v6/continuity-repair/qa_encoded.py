"""Read-only encoded patch / exact candidate seam evidence; never installs or approves."""
from pathlib import Path
import argparse,json,runpy,subprocess,shutil
from fractions import Fraction
from datetime import datetime,timezone
from PIL import Image

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
UTIL=ROOT/'scripts/qa_focus_v6.py'
U=runpy.run_path(str(UTIL),run_name='locked_qa_helpers')
sha,safe,read,require,rel,write_new=[U[k] for k in ['sha','safe','read','require','rel','write_new']]
require(sha(UTIL)=='b62530b6c15925228506240edb45d592f1b8ff8feaefda2104ff65df2d978717','QA helper changed')
BASE='c9f90b7b6c2f79a9238d38e82c752394c4faf1419eed40b36b30e4e2b164e8a4'
TL='e976021ce9b1a665ca54206e73898587efb33c6f91865eb22bb8b7ad0c71dfb0'
MASTER='dec0de170d5796dadad56323e11041195049e3c0e4c365e4ed50f17fa15b1146'
LOCK='4b704b5c851e8d33eba9dcc07db204abfefcab3652973259ba6edddadfc033fe'
WATCH={}
def watch(path,expected=None):
 p=safe(path);digest=sha(p)
 if expected:require(digest==expected,f'Hash mismatch: {rel(p)}')
 WATCH[rel(p)]=digest
 return p
def common():
 watch(__file__);watch(UTIL);watch('src/timeline.json',TL);watch('public/timeline.json',TL);watch('public/master.wav',MASTER)
 lock=read(watch(HERE/'patch-source-lock.json',LOCK))
 require(lock['frames']==25621 and lock['fps']==30,'Wrong lock duration')
 for item in lock['files']:
  watch(item['path'],item['sha256']);watch(item['snapshot'],item['sha256'])
 return lock,read(ROOT/'src/timeline.json')
def patch_marker(start,end,lock):
 mpath=watch(f'tmp/v6-continuity-patches/segment-{start}-{end}.json');m=read(mpath)
 require(m.get('success') is True and m.get('fullDecodeSuccess') is True and m.get('startsAtPTSZero') is True,'Incomplete patch marker')
 require(m.get('renderMode')=='remotion-v6-continuity-silent-patch' and m.get('silent') is True and m.get('audioStreamCount')==0,'Unexpected patch mode')
 require(m.get('inputProps')=={'audio':False,'clean':False},'Patch lacks final text overlays')
 require(m['frames']==[start,end] and m['frameCount']==end-start+1,'Wrong patch interval')
 require(m['timelineSHA256']==TL and m['masterSHA256']==MASTER and m['baseVideoSHA256']==BASE,'Patch source lineage differs')
 require(m['sourceLockSHA256']==LOCK and m['sourceHashes']=={i['path']:i['sha256'] for i in lock['files']},'Patch source snapshot differs')
 for field in ['sourceLock','baseMarker','baseSourceLock','runner','renderPlan','gpuAdapter']:
  watch(m[field],m[field+'SHA256'])
 require('RTX 5060' in m['activeGLRenderer'],'Unexpected graphics backend')
 p=watch(m['outputLocation'],m['videoSHA256'])
 require(p==ROOT/f'tmp/v6-continuity-patches/segment-{start}-{end}.mp4','Wrong patch target')
 return m,p
def hashrows(path):
 lines=path.read_text(encoding='utf-8').splitlines();tb=Fraction(next(x.split(':',1)[1].strip() for x in lines if x.startswith('#tb 0:')))
 rows={}
 for line in lines:
  if not line or line.startswith('#'):continue
  f=[x.strip() for x in line.split(',')];number=Fraction(int(f[2]))*tb*30
  require(number.denominator==1 and int(f[4])==3110400,'Unexpected decoded payload/PTS')
  rows[int(number)]=f[5]
 return rows
def extract(video,origin,groups,out,tl,*,seek=False,expected=None):
 frames=sorted({f for g in groups for f in g['frames']});require(all(f>=origin for f in frames),'Negative relative frame')
 require(not out.exists(),'Refusing existing extraction output');(out/'frames').mkdir(parents=True)
 expr='+'.join(f'eq(n\\,{f-origin})' for f in frames);hashfile=out/'decoded-framehash.txt'
 cmd=[shutil.which('ffmpeg'),'-hide_banner','-nostdin','-n','-xerror','-hwaccel','none','-threads','2','-filter_complex_threads','1']
 if seek:
  require(origin%30==0,'Seek must start at an exact whole second')
  cmd+=['-ss',str(origin//30)]
 cmd+=['-i',str(video),'-filter_complex',f'[0:v:0]select={expr},split=2[jpg][rawhash]',
  '-map','[jpg]','-an','-fps_mode','vfr','-c:v','mjpeg','-q:v','2','-threads','2','-frames:v',str(len(frames)),'-start_number','0',str(out/'frames/selected-%06d.jpg'),
  '-map','[rawhash]','-an','-fps_mode','passthrough','-c:v','rawvideo','-pix_fmt','yuv420p','-threads','1','-f','framehash','-hash','sha256','-frames:v',str(len(frames)),str(hashfile)]
 write_new(out/'command.json',{'command':cmd,'absoluteFrames':frames,'origin':origin,'candidateExpectedFrameHashes':expected is not None})
 p=subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8',errors='replace');(out/'extraction.log').write_text(p.stderr,encoding='utf-8');require(p.returncode==0,p.stderr[-2000:])
 raw=U['parse_framehash'](hashfile,[f-origin for f in frames]);records=[]
 for i,(f,r) in enumerate(zip(frames,raw)):
  if expected is not None:require(r['decodedYUV420pSHA256']==expected[f],f'Seek did not reproduce absolute candidate frame {f}')
  src=out/f'frames/selected-{i:06d}.jpg';dst=out/f'frames/frame-{f:06d}.jpg'
  with Image.open(src) as im:require(im.size==(1920,1080),'Unexpected frame dimensions')
  src.rename(dst);records.append({**r,'frame':f,'absoluteTimeSeconds':f/30,'path':rel(dst),'sha256':sha(dst),'candidateRawHashVerified':expected is not None})
 sheets=[]
 for g in groups:
  for i,k in enumerate(range(0,len(g['frames']),8),1):sheets.append(U['make_sheet'](g,g['frames'][k:k+8],i,out,sha(video),tl))
 result={'video':rel(video),'videoSHA256':sha(video),'origin':origin,'groups':groups,'frameRecords':records,'contactSheets':sheets,'rawHashFile':rel(hashfile),'rawHashFileSHA256':sha(hashfile),'subjectiveVisualReviewCompleted':False}
 write_new(out/'manifest.json',result)
 return result
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--patches',action='store_true');ap.add_argument('--candidate-marker',type=Path);ap.add_argument('--validate-only',action='store_true');a=ap.parse_args()
 require(a.patches != bool(a.candidate_marker),'Choose patches or candidate marker')
 lock,tl=common();pm=[patch_marker(12000,12249,lock),patch_marker(20250,20749,lock)]
 if a.patches:
  runs=[(pm[0][1],12000,[U['group']('encoded-patch-h042','Actual annotated patch: receptor to plasma context',sorted(set(range(12100,12176,5))|set(range(12115,12151))))]),(pm[1][1],20250,[U['group']('encoded-patch-h073','Actual annotated patch: platelet patch to existing lesion',sorted(set(range(20430,20536,5))|set(range(20445,20486))))])]
  target=HERE/'encoded-patch-review';digest='two-locked-patches';finalrows=None
 else:
  markerpath=watch(a.candidate_marker);m=read(markerpath)
  require(m['success'] is True and m['singlePassRender'] is False and m['renderMode']=='c9-full-base-with-idr-local-patches-video-stream-copy','Wrong composite marker')
  require(m['frames']==[0,25620] and m['timelineSHA256']==TL and m['masterSHA256']==MASTER and m['sourceLockSHA256']==LOCK,'Composite source differs')
  video=watch(m['outputLocation'],m['videoSHA256']);require(video==safe(m['candidate']),'Candidate output mismatch')
  watch(m['sourceLock'],LOCK);val=read(watch(m['validation'],m['validationSHA256']));c=m['composition'];br=m['baseRender']
  for p,h in [(c['composer'],c['composerSHA256']),(c['verifier'],c['verifierSHA256']),(c['planPath'],c['planSHA256']),(br['markerPath'],br['markerSHA256']),(br['validation'],br['validationSHA256']),(br['sourceLock'],br['sourceLockSHA256']),(br['manifest'],br['manifestSHA256'])]:watch(p,h)
  require(br['videoSHA256']==BASE and val['videoSHA256']==m['videoSHA256'] and val['automaticChecksPass'] and val['fullDecodeSuccess'] and val['decodedFrames']==25621,'Composite validation failed')
  require(val['audioComparison']['zeroLagVerified'] and val['audioComparison']['masterSHA256']==MASTER,'Composite audio unverified')
  corr=val['frameCorrespondence'];require(corr['allFramesMatched'] and corr['PTSExact'] and corr['baseFramesMatched']==24871 and corr['patchFramesMatched']==750,'Composite raw-frame identity proof missing')
  report=corr['hashReports']['final'];finalrows=hashrows(watch(report['path'],report['sha256']));require(len(finalrows)==25621,'Incomplete final framehash')
  for patch,video_path in pm:
   patchreport=corr['hashReports']['patches'][str(patch['frames'][0])];prow=hashrows(watch(patchreport['path'],patchreport['sha256']))
   require(len(prow)==patch['frameCount'],'Incomplete patch hash report')
   require(all(finalrows[patch['frames'][0]+n]==h for n,h in prow.items()),'Patch-to-final raw identity mismatch')
  runs=[(video,(b-5)//30*30,[U['group'](f'final-seam-{b}','Inspect exact composite seam; all selected raw pixels checked against full validated framehash',list(range(b-5,b+6)))]) for b in [12000,12250,20250,20750]]
  target=HERE/'encoded-final-review'/m['videoSHA256'][:16];digest=m['videoSHA256']
 if a.validate_only:print(json.dumps({'validated':True,'runCount':len(runs),'output':rel(target),'watchedFiles':len(WATCH)}));return
 require(not target.exists(),'Review evidence already exists');target.mkdir(parents=True)
 result=[]
 for i,(video,origin,groups) in enumerate(runs):result.append(extract(video,origin,groups,target/f'window-{i+1:02d}',tl,seek=not a.patches,expected=finalrows))
 for p,h in WATCH.items():require(sha(safe(p))==h,f'Input changed during extraction: {p}')
 out={'completedUTC':datetime.now(timezone.utc).isoformat(),'kind':'locked-patches' if a.patches else 'composite-candidate-seams','videoSHA256':digest,'timelineSHA256':TL,'masterSHA256':MASTER,'inputSHA256':WATCH,'windows':result,'subjectiveVisualReviewCompleted':False,'installedByThisTool':False,'allSelectedCandidateFramesMatchedValidatedRawHash':not a.patches}
 write_new(target/'manifest.json',out);print(json.dumps({'manifest':rel(target/'manifest.json'),'manifestSHA256':sha(target/'manifest.json'),'frames':sum(len(r['frameRecords']) for r in result),'sheets':sum(len(r['contactSheets']) for r in result)},indent=2))
if __name__=='__main__':main()
