from __future__ import annotations

"""Encode-level QA for the V19Motion delivery.

This report checks the bytes that were actually rendered (metadata, complete
decode, audio duration/level and provenance bindings). It does not claim a
normal-speed visual review or human listening pass.
"""
import argparse, hashlib, json, math, re, shutil, subprocess
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/'work/output-root-v19-motion.json').read_text(encoding='utf-8'))
OUTPUT_ROOT=Path(CONFIG['outputRoot'])
DEFAULT_VIDEO=OUTPUT_ROOT/'delivery'/'彩虹为什么是弧形_V19_动作与转场优化_1080p.mp4'
SOURCE_AUDIT=OUTPUT_ROOT/'research/qa-v19-motion'/'audit-v19-motion.json'
RENDER_POINTER=OUTPUT_ROOT/'research/qa-v19-motion'/'latest-full-render.json'
RENDER_RECORD=None
QA_DIR=OUTPUT_ROOT/'research/qa-v19-motion'; WORK_DIR=OUTPUT_ROOT/'work'/'qa-v19-motion-delivery'
EXPECTED={'width':1920,'height':1080,'fps':30,'frames':10702,'duration':10702/30,'sample_rate':48000,'channels':2}
def sha256(p:Path)->str:
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def tool(name):
 p=shutil.which(name) or str(Path('C:/ffmpeg/bin')/f'{name}.exe')
 if not Path(p).is_file():raise FileNotFoundError(f'{name} unavailable')
 return p
def run(cmd,timeout=2400,check=False):
 p=subprocess.run(cmd,cwd=ROOT,text=True,encoding='utf-8',errors='replace',capture_output=True,timeout=timeout)
 if check and p.returncode:raise RuntimeError(f'{Path(cmd[0]).name} failed: {p.stderr[-4000:]}')
 return p
def rate(v):
 try:return float(Fraction(v))
 except:return float('nan')
def spans(text,kind,verified_duration=None):
 if kind=='black':
  pat=re.compile(r'black_start:(?P<start>-?\d+(?:\.\d+)?)\s+black_end:(?P<end>-?\d+(?:\.\d+)?)\s+black_duration:(?P<duration>-?\d+(?:\.\d+)?)')
  return [{k:float(m.group(k)) for k in ('start','end','duration')} for m in pat.finditer(text)]
 pat=re.compile(r'silence_start:\s*(?P<start>-?\d+(?:\.\d+)?)|silence_end:\s*(?P<end>-?\d+(?:\.\d+)?)');out=[];opened=None
 for m in pat.finditer(text):
  if m.group('start') is not None:opened=float(m.group('start'))
  elif m.group('end') is not None and opened is not None:out.append({'start':opened,'end':float(m.group('end')),'duration':float(m.group('end'))-opened});opened=None
 if opened is not None:
  if verified_duration is not None and math.isfinite(verified_duration) and verified_duration>=opened:
   out.append({'start':opened,'end':verified_duration,'duration':verified_duration-opened,'closedAtVerifiedAudioEOF':True})
  else:out.append({'start':opened,'end':None,'duration':None})
 return out
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--video',type=Path,default=DEFAULT_VIDEO);ap.add_argument('--source-audit',type=Path,default=None);ap.add_argument('--render-record',type=Path,required=True);a=ap.parse_args()
 video=a.video if a.video.is_absolute() else ROOT/a.video
 pointer=json.loads(RENDER_POINTER.read_text(encoding='utf8')) if RENDER_POINTER.is_file() else {}
 renderp=a.render_record or Path(pointer.get('renderRecord',''))
 renderp=renderp if renderp.is_absolute() else ROOT/renderp
 if not renderp.is_file():raise FileNotFoundError('No completed repair render record. Run render-v19-motion.mjs first.')
 render=json.loads(renderp.read_text(encoding='utf8'))
 source=a.source_audit or Path(render.get('sourceAudit',''))
 source=source if source.is_absolute() else ROOT/source
 QA_DIR.mkdir(parents=True,exist_ok=True);WORK_DIR.mkdir(parents=True,exist_ok=True);errors=[];warnings=[];checks={};check=lambda ok,msg:(checks.__setitem__(msg,bool(ok)),errors.append(msg) if not ok else None)
 audit=json.loads(source.read_text(encoding='utf8')); render=json.loads(renderp.read_text(encoding='utf8')) if renderp.is_file() else {}
 check(audit.get('version')=='V19Motion' and audit.get('passed') is True,'V19Motion source audit passed');check(render.get('version')=='V19Motion' and render.get('status')=='completed','V19Motion render record completed')
 if not video.is_file():raise FileNotFoundError(video)
 vh=sha256(video);check(Path(render.get('output','')).resolve()==video.resolve(),'Delivery path matches V19Motion render record');check(render.get('videoSHA256')==vh,'Delivery SHA256 matches V19Motion render record');check(render.get('sourceAuditSHA256')==sha256(source),'Render record binds immutable V19Motion audit snapshot')
 # Bind the actual render snapshot and current source, including C public mappings.
 def logical_path(file):
  normalized=file.replace('\\','/')
  if normalized.startswith('public/'):
   rest=normalized[7:].split('/'); override=CONFIG.get('publicOverrides',{}).get(rest[0])
   if override:return Path(override).joinpath(*rest[1:]).resolve()
  return (ROOT/file).resolve()
 snapshotp=Path(render.get('sourceSnapshot',''))
 snapshotp=snapshotp if snapshotp.is_absolute() else ROOT/snapshotp
 check(snapshotp.is_file(),'Render input snapshot exists')
 if snapshotp.is_file():
  check(render.get('sourceSnapshotSHA256')==sha256(snapshotp),'Render binds immutable input snapshot')
  snapshot=json.loads(snapshotp.read_text(encoding='utf8'))
 else:snapshot={}
 audit_bindings={r['file']:r for r in audit.get('sourceHashes',[])}
 render_bindings={r['file']:r for r in render.get('sourceHashes',[])}
 snapshot_bindings={r['file']:r for r in snapshot.get('sourceHashes',[])}
 check(bool(audit_bindings) and bool(render_bindings) and bool(snapshot_bindings),'Audit, render and snapshot contain source bindings')
 for label,rows in [('audit',audit_bindings),('snapshot',snapshot_bindings)]:
  check(all(f in render_bindings and r['sha256']==render_bindings[f]['sha256'] for f,r in rows.items()),label+' bindings are included unchanged in render record')
 source_issues=[]
 for logical,row in render_bindings.items():
  expected=logical_path(logical)
  if not row.get('absolutePath') or Path(row['absolutePath']).resolve()!=expected:source_issues.append({'file':logical,'reason':'absolute mapping differs'})
  elif not expected.is_file():source_issues.append({'file':logical,'reason':'missing'})
  elif sha256(expected)!=row['sha256']:source_issues.append({'file':logical,'reason':'current SHA256 differs'})
 check(not source_issues,'All latest current source/resource hashes and absolute mappings match rendered bindings')
 selection=render.get('selection',{})
 check(selection.get('outputRangeInclusive')==[0,10701] and selection.get('outputFrameCount')==10702,'Render selection is the complete 10702-frame timeline')
 check(render.get('preview') is False and render.get('scope')=='full delivery','Render is a full delivery, not a preview')
 check(render.get('inputProps')=={'audio':True,'clean':False,'plate':False},'Full delivery input properties are correct')
 bundle=Path(render.get('bundleDir',''))/'bundle.js'
 check(bundle.is_file() and sha256(bundle)==render.get('bundleEntrySHA256'),'Actual renderer bundle hash remains bound')
 latest=json.loads(SOURCE_AUDIT.read_text(encoding='utf8')) if SOURCE_AUDIT.is_file() else {}
 latest_rows={r['file']:r['sha256'] for r in latest.get('sourceHashes',[])}
 check(latest.get('version')=='V19Motion' and latest.get('passed') is True,'Latest V19Motion source audit passed')
 check(latest_rows=={f:r['sha256'] for f,r in audit_bindings.items()},'Latest source audit bindings equal immutable rendered audit')
 checks['boundInputCount']=len(render_bindings)
 master=ROOT/'public/audio_v18/master-v18.wav';mh=sha256(master) if master.is_file() else None;check(master.is_file(),'V19Motion master WAV exists');bound=next((r for r in audit.get('sourceHashes',[]) if r.get('file')=='public/audio_v18/master-v18.wav'),None);check(bound and bound.get('sha256')==mh,'V19Motion source audit binds current master WAV')
 ffmpeg,ffprobe=tool('ffmpeg'),tool('ffprobe');meta=json.loads(run([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(video)],check=True).stdout);(QA_DIR/'ffprobe-delivery-v19-motion.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf8');streams=meta.get('streams',[]);v=next((s for s in streams if s.get('codec_type')=='video'),None);aud=next((s for s in streams if s.get('codec_type')=='audio'),None);check(v is not None and aud is not None,'Video and audio streams exist')
 verified_audio_duration=None
 if v and aud:
  fps,nominal=rate(v.get('avg_frame_rate','nan')),rate(v.get('r_frame_rate','nan'));duration=float(v.get('duration',meta.get('format',{}).get('duration','nan')));aduration=float(aud.get('duration','nan'));frames=int(v.get('nb_frames') or 0)
  if not frames:
   q=run([ffprobe,'-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','default=nw=1:nk=1',str(video)],check=True)
   try:frames=int(q.stdout.strip())
   except ValueError:frames=0
  checks.update(videoWidth=int(v.get('width',0)),videoHeight=int(v.get('height',0)),avgFPS=fps,nominalFPS=nominal,frameCount=frames,videoSeconds=duration,audioSeconds=aduration);check((int(v.get('width',0)),int(v.get('height',0)))==(1920,1080),'Video is 1920x1080');check(abs(fps-30)<1e-9 and abs(nominal-30)<1e-9,'Video is 30 fps');check(frames==10702,'V19Motion frame count is 10702');check(abs(duration-EXPECTED['duration'])<=1/30+.002,'V19Motion duration matches 10702 frames');check(aud.get('codec_name')=='aac','Audio codec is AAC');check(int(aud.get('sample_rate',0))==48000 and int(aud.get('channels',0))==2,'Audio is 48 kHz stereo');check(math.isfinite(aduration) and abs(aduration-duration)<=2/30,'Audio/video drift <= two frames')
  if math.isfinite(aduration) and aduration>0 and math.isfinite(duration) and abs(aduration-duration)<=2/30 and abs(duration-EXPECTED['duration'])<=1/30+.002:verified_audio_duration=aduration
 decode=run([ffmpeg,'-hide_banner','-nostdin','-v','error','-xerror','-i',str(video),'-map','0:v:0','-map','0:a:0','-f','null','-']);(WORK_DIR/'strict-decode.stderr.txt').write_text(decode.stderr,encoding='utf8');check(decode.returncode==0,'Strict FFmpeg audio/video decode passes')
 black=run([ffmpeg,'-hide_banner','-nostdin','-v','info','-i',str(video),'-vf','blackdetect=d=0.5:pix_th=0.001:pic_th=0.98','-an','-f','null','-']);(WORK_DIR/'blackdetect.stderr.txt').write_text(black.stderr,encoding='utf8');blackspans=spans(black.stderr,'black');longblack=[x for x in blackspans if x['duration']>=.5]
 check(black.returncode==0,'Black-frame analysis completed')
 if longblack:warnings.append('Blackdetect found dark spans; authored context has not been verified.')
 silence=run([ffmpeg,'-hide_banner','-nostdin','-v','info','-i',str(video),'-map','0:a:0','-af','silencedetect=n=-60dB:d=1','-f','null','-']);(WORK_DIR/'silencedetect.stderr.txt').write_text(silence.stderr,encoding='utf8');silencespans=spans(silence.stderr,'silence',verified_audio_duration);longsilence=[x for x in silencespans if x.get('duration') is not None and x['duration']>=1]
 check(silence.returncode==0,'Silence analysis completed')
 if longsilence:warnings.append('Audio silence spans <= -60 dBFS were found; inspect pauses.')
 loud=run([ffmpeg,'-hide_banner','-nostdin','-v','info','-i',str(video),'-map','0:a:0','-af','loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json','-f','null','-']);(WORK_DIR/'loudnorm.stderr.txt').write_text(loud.stderr,encoding='utf8');measurement=None
 for m in re.finditer(r'\{\s*"input_i".*?\}',loud.stderr,re.S):
  try:measurement=json.loads(m.group(0))
  except json.JSONDecodeError:pass
 check(loud.returncode==0 and measurement is not None,'Loudness analysis completed')
 if measurement:
  check(math.isfinite(float(measurement['input_tp'])) and float(measurement['input_tp'])<=-.1,'Decoded AAC true peak stays below -0.1 dBTP')
  check(-20<=float(measurement['input_i'])<=-12,'Decoded AAC integrated loudness is between -20 and -12 LUFS')
 report={'version':'V19Motion','schema':'rainbow.v19-motion.delivery-encode-qa/2','renderRunId':render.get('runId'),'createdUTC':datetime.now(timezone.utc).isoformat(),'video':str(video),'videoSHA256':vh,'sourceAudit':str(source),'renderRecord':str(renderp),'renderStatus':render.get('status'),'expected':EXPECTED,'checks':checks,'errors':errors,'warnings':warnings,'passed':not errors,'scope':'ffprobe metadata, strict FFmpeg decode, black/silence reports, AAC loudness, immutable render snapshots, current source hashes/absolute public mappings and source/render provenance. No normal-speed visual playback or human listening is claimed.','audio':{'master':'public/audio_v18/master-v18.wav','masterSHA256':mh,'decodedAACLoudnorm':measurement,'subjectiveListeningChecked':False},'sourceIntegrity':{'currentMismatchDetails':source_issues,'boundInputCount':len(render_bindings),'latestAudit':str(SOURCE_AUDIT)},'blackDetect':{'spans':blackspans,'longSpans':longblack,'automaticPassPolicy':'reported-only'},'silenceDetect':{'spans':silencespans,'longSpans':longsilence,'automaticPassPolicy':'reported-only'}}
 out=QA_DIR/'qa-delivery-v19-motion.json'
 run_out=renderp.parent/'qa-delivery.json';run_out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'version':'V19Motion','passed':report['passed'],'errors':errors,'warnings':warnings,'videoSHA256':vh,'output':str(out)},ensure_ascii=False,indent=2));return 0 if not errors else 1
if __name__=='__main__':
 try:raise SystemExit(main())
 except Exception as e:print(f'qa-delivery-v19-motion failed: {e}',file=__import__('sys').stderr);raise
