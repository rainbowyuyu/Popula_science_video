"""Assemble a reviewed local label correction and preserve a complete reproducible source snapshot."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,shutil,subprocess
ROOT=Path(__file__).resolve().parents[2]
def read(p):return json.loads(p.read_text('utf8'))
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def run(args):return subprocess.run(args,check=True,capture_output=True,text=True,encoding='utf8',errors='replace')
base=ROOT/'tmp/v7-full-final';patch=ROOT/'tmp/v7-adrenal-label-patch';out=ROOT/'tmp/v7-final-corrected'
assert not (out/'result.json').exists();out.mkdir(exist_ok=True)
a=read(base/'result.json');b=read(patch/'result.json')
assert b['frameRange']==[15115,15404] and b['mode']=='clip'
changed=[p for p,h in a['hashes'].items() if b['hashes'][p]!=h]
assert changed==['src/V5Regulation.ts'],changed
hashes=dict(b['hashes']);hashes['research/revision-v7/assemble_label_repair.py']=sha(Path(__file__))
for rel,digest in hashes.items():
 source=ROOT/rel;assert sha(source)==digest
 dest=out/'frozen'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest);assert sha(dest)==digest
(out/'source-lock.json').write_text(json.dumps({'createdUTC':datetime.now(timezone.utc).isoformat(),'files':hashes,'frames':a['frames'],'fps':30,'localRepair':'h054 adrenal label; full rerender from frozen source remains supported'},ensure_ascii=False,indent=2),'utf8')
shutil.copy2(base/'baseline.json',out/'baseline.json');shutil.copy2(base/'chapters.ffmetadata',out/'chapters.ffmetadata')
video=out/'GLP1_V7_1080p.mp4';assert not video.exists()
filters='[0:v]split=2[head][tail];[head]trim=end_frame=15115,setpts=PTS-STARTPTS[h];[1:v]trim=end_frame=290,setpts=PTS-STARTPTS[p];[tail]trim=start_frame=15405,setpts=PTS-STARTPTS[t];[h][p][t]concat=n=3:v=1:a=0[v]'
args=['ffmpeg','-hide_banner','-nostdin','-v','error','-n','-i',str(ROOT/a['video']),'-i',str(patch/'silent.mp4'),'-i',str(out/'chapters.ffmetadata'),'-filter_complex',filters,'-map','[v]','-map','0:a:0','-map_metadata','2','-map_chapters','2','-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p','-r','30','-frames:v',str(a['frames']),'-c:a','copy','-color_range','tv','-colorspace','bt709','-color_trc','bt709','-color_primaries','bt709','-movflags','+faststart+write_colr',str(video)]
print('Assembling corrected h054; preserving existing AAC packets',flush=True);run(args)
probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]).stdout)
v=next(s for s in probe['streams'] if s['codec_type']=='video');assert int(v['nb_frames'])==a['frames'] and v['width']==1920 and v['height']==1080
assert abs(float(probe['format']['duration'])-a['frames']/30)<.08
run(['ffmpeg','-hide_banner','-nostdin','-v','error','-xerror','-i',str(video),'-map','0:v:0','-map','0:a:0','-f','null','-'])
for rel,digest in hashes.items():assert sha(ROOT/rel)==digest
result={'mode':'full','video':str(video.relative_to(ROOT)).replace('\\','/'),'videoSHA256':sha(video),'masterSHA256':hashes['public/master.wav'],'timelineSHA256':hashes['src/timeline.json'],'frames':a['frames'],'fps':30,'fullDecode':True,'probe':probe,'hashes':hashes,'reviewStatus':'pending','assembly':{'baseVideoSHA256':a['videoSHA256'],'baseRenderResult':str(base/'result.json'),'patchRenderResult':str(patch/'result.json'),'patchVideoSHA256':sha(patch/'silent.mp4'),'frameRangeInclusive':[15115,15404],'changedSource':changed,'method':'Exact frame trims, 290-frame local replacement, whole-video H264 CRF16 encoding, original verified AAC stream copied','reproduction':'Current/frozen source can independently reproduce full film with scripts/run_v7.mjs --mode=full --replay=true'}}
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf8');print(json.dumps({'done':True,'video':str(video),'sha256':result['videoSHA256']},ensure_ascii=False))
