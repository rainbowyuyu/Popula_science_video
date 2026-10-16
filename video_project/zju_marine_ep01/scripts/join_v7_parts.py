"""Join verified head/tail render pieces at an exact frame boundary, never time-rounded."""
from pathlib import Path
import argparse,hashlib,json,subprocess,datetime
ap=argparse.ArgumentParser();ap.add_argument('--head',type=Path,required=True);ap.add_argument('--tail',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args()
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
meta=[probe(p) for p in [a.head,a.tail]];streams=[next(x for x in d['streams'] if x['codec_type']=='video') for d in meta]
for v in streams:
 if (v['width'],v['height'],v['r_frame_rate'])!=(1920,1080,'30/1'):raise ValueError('Mismatched render format')
if int(streams[0]['nb_frames'])<5508 or int(streams[1]['nb_frames'])!=5507:raise ValueError('Invalid split count')
if a.output.exists():raise FileExistsError(a.output)
a.output.parent.mkdir(exist_ok=True,parents=True)
tmp=a.output.with_name(a.output.stem+'.joining.mp4')
graph='[0:v]trim=start_frame=0:end_frame=5508,setpts=PTS-STARTPTS[h];[1:v]setpts=PTS-STARTPTS[t];[h][t]concat=n=2:v=1:a=0[v]'
cmd=['ffmpeg','-hide_banner','-nostdin','-y','-i',str(a.head),'-i',str(a.tail),'-filter_complex',graph,'-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-r','30','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(tmp)]
with a.output.with_suffix('.join.log').open('w',encoding='utf8') as f:subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,check=True)
final=probe(tmp);v=next(x for x in final['streams'] if x['codec_type']=='video')
if int(v['nb_frames'])!=11015 or abs(float(v['duration'])-11015/30)>.001:raise ValueError('Join frame count mismatch')
tmp.replace(a.output)
report={'created':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':{'path':str(a.head),'sha256':sha(a.head),'inputFrames':int(streams[0]['nb_frames']),'usedFrameRange':[0,5507]},'tail':{'path':str(a.tail),'sha256':sha(a.tail),'inputFrames':5507,'globalFrameRange':[5508,11014]},'output':{'path':str(a.output),'sha256':sha(a.output),'frames':11015},'method':'Frame-exact trim + concat; one H.264 CRF16 encode; audio muxed separately','ffprobe':final}
a.output.with_suffix('.join.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report['output']))
