"""Replace only the reviewed 20-second camera section; retain full audio timing."""
from pathlib import Path
import json,subprocess,hashlib,os,datetime
R=Path(__file__).resolve().parents[1];Q=R/'research/qa'
video=R/'delivery/雨后的一道弧_彩虹为什么是弧形_1080p.mp4'
original=R/'tmp/original-full-render.mp4'
base=original if original.exists() else video
patch=R/'tmp/circle-finish.mp4';out=R/'tmp/final-refined.mp4'
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,width,height,r_frame_rate','-of','json',str(p)]))['streams'][0]
assert int(probe(patch)['nb_frames'])==600
assert int(probe(video)['nb_frames'])==8931
beforeHash=hashlib.sha256(base.read_bytes()).hexdigest()
filtergraph='[0:v]trim=start_frame=0:end_frame=5120,setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[0:v]trim=start_frame=5720:end_frame=8931,setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0[v]'
args=['ffmpeg','-hide_banner','-loglevel','warning','-y','-i',str(base),'-i',str(patch),'-i',str(R/'public/audio/rainbow-arc-master.wav'),'-filter_complex',filtergraph,'-map','[v]','-map','2:a:0','-c:v','h264_nvenc','-preset','p7','-tune','hq','-rc','vbr','-cq','17','-b:v','0','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-r','30','-fps_mode','cfr','-c:a','aac','-b:a','192k','-ar','48000','-t','297.7','-movflags','+faststart',str(out)]
with (Q/'refine-encode.log').open('w',encoding='utf8') as log:subprocess.run(args,check=True,stdout=log,stderr=log)
info=probe(out);assert int(info['nb_frames'])==8931 and info['width']==1920
old=R/'tmp/intermediate-refinement.mp4' if original.exists() else original
os.replace(video,old);os.replace(out,video)
lock=json.loads((Q/'render-source-lock.json').read_text(encoding='utf8'))
if not (Q/'render-source-lock-initial.json').exists():(Q/'render-source-lock-initial.json').write_text(json.dumps(lock,ensure_ascii=False,indent=2),encoding='utf8')
for rel in lock['files']:
 p=R/rel;lock['files'][rel]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
lock['time']=datetime.datetime.now().isoformat();lock['method']='Full Remotion base; frames5120..5719 rerendered after sun-marker and subtitle-safe camera refinement; CFR concatenate and original master AAC encode.'
(Q/'render-source-lock.json').write_text(json.dumps(lock,ensure_ascii=False,indent=2),encoding='utf8')
report={'baseSHA256':beforeHash,'patchSHA256':hashlib.sha256(patch.read_bytes()).hexdigest(),'finalSHA256':hashlib.sha256(video.read_bytes()).hexdigest(),'replacedInclusiveFrames':[5120,5719],'totalFrames':8931,'outsideRangeSourceBehaviorUnchanged':True,'audioSource':'public/audio/rainbow-arc-master.wav','timeStretch':False}
(Q/'final-refinement.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,indent=2))
