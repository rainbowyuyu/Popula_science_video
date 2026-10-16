"""Read-only decoded pixel equivalence for integer-second preseek; no production mutations."""
from pathlib import Path
import concurrent.futures,hashlib,json,subprocess,time,datetime
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
FFMPEG=Path('C:/ffmpeg/bin/ffmpeg.exe')
VIDEO=ROOT/'delivery/GLP1_V5_1080p.mp4'
PLAN=ROOT/'research/revision-v5/final-boundary-repair/patch-plan.json'
COMPOSER=ROOT/'scripts/compose_final_boundary_patches_v5.py'
TIMELINE=ROOT/'src/timeline.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
watched={str(p.relative_to(ROOT)):sha(p) for p in [VIDEO,PLAN,COMPOSER,TIMELINE]}
plan=json.loads(PLAN.read_text(encoding='utf-8-sig'));tl=json.loads(TIMELINE.read_text(encoding='utf-8-sig'))
spans=[];cursor=0
for row in plan['patches']:
 if row['start']>cursor:spans.append({'start':cursor,'end':row['start']-1})
 cursor=row['end']+1
if cursor<tl['duration']:spans.append({'start':cursor,'end':tl['duration']-1})
endpoints=sorted({f for s in spans for f in (s['start'],s['end'])})
def parse(stdout):
 result=[]
 for line in stdout.splitlines():
  if not line or line.startswith('#'):continue
  q=[x.strip() for x in line.split(',')]
  if len(q)!=6:raise RuntimeError('Unexpected frame checksum '+line)
  result.append({'stream':int(q[0]),'dts':int(q[1]),'pts':int(q[2]),'duration':int(q[3]),'size':int(q[4]),'md5':q[5]})
 return result
def run(label,frames,seek=0):
 command=[str(FFMPEG),'-hide_banner','-nostdin','-v','error','-threads','2']
 if seek:command+=['-ss',str(seek)]
 command+=['-i',str(VIDEO),'-map','0:v:0','-an','-sn','-dn','-vf','select='+ '+'.join(f'eq(n\\,{f})' for f in frames),'-frames:v',str(len(frames)),'-fps_mode:v','passthrough','-pix_fmt','yuv420p','-f','framemd5','-']
 # The argument is passed directly to FFmpeg, so escape only its filter comma.
 command[command.index('-vf')+1]=command[command.index('-vf')+1].replace('\\\\,','\\,')
 start=time.monotonic();p=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180)
 (OUT/(label+'.framemd5')).write_text(p.stdout,encoding='utf-8')
 (OUT/(label+'.stderr')).write_text(p.stderr,encoding='utf-8')
 rows=parse(p.stdout)
 result={'label':label,'command':command,'seekSeconds':seek,'expectedLocalFrames':frames,'elapsedSeconds':time.monotonic()-start,'returnCode':p.returncode,'frames':rows}
 if p.returncode or [x['pts'] for x in rows]!=frames:raise RuntimeError(json.dumps(result)+'\n'+p.stderr[-2000:])
 print(label+' verified expected frame indexes',flush=True)
 return result
start=time.monotonic()
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 ref=pool.submit(run,'sequential-reference',endpoints)
 jobs=[]
 for i,span in enumerate(spans):
  seek=max(0,span['start']//30-2);frames=[span['start']-seek*30,span['end']-seek*30]
  jobs.append((span,pool.submit(run,f'preseek-{i:02d}',frames,seek)))
 reference=ref.result();byframe={x['pts']:x for x in reference['frames']}
 results=[]
 for span,future in jobs:
  item=future.result();item.update(span)
  item['pixelMatches']=[{'absoluteFrame':x['pts']+item['seekSeconds']*30,'expectedMD5':byframe[x['pts']+item['seekSeconds']*30]['md5'],'actualMD5':x['md5'],'match':byframe[x['pts']+item['seekSeconds']*30]['md5']==x['md5'],'decodedBytes':x['size']} for x in item['frames']]
  results.append(item)
unchanged={p:sha(ROOT/p)==h for p,h in watched.items()}
report={'createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ffmpegVersion':subprocess.run([str(FFMPEG),'-version'],capture_output=True,text=True).stdout.splitlines()[0],'readOnly':True,'inputSHA256':watched,'inputsUnchanged':unchanged,'spans':len(spans),'endpointComparisons':sum(len(x['pixelMatches']) for x in results),'elapsedSeconds':time.monotonic()-start,'reference':reference,'preseekResults':results,'allPixelMatches':all(x['match'] for r in results for x in r['pixelMatches']),'allInputHashesUnchanged':all(unchanged.values()),'limitation':'Pixel equality proven for each span first and last frame only; not all retained frames. Full decoded output count/timing checks remain mandatory.'}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:report[k] for k in ['spans','endpointComparisons','elapsedSeconds','allPixelMatches','allInputHashesUnchanged']},indent=2),flush=True)
if not report['allPixelMatches'] or not report['allInputHashesUnchanged']:raise SystemExit(1)
