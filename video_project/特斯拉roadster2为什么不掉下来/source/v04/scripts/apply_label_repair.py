"""Replace frames 5260–5579 with the corrected label, retaining the AAC track."""
from pathlib import Path
import hashlib, json, subprocess, shutil

R=Path(__file__).resolve().parents[1]
P=R.parents[1]
movie=P/'output/v04/Roadster_倒挂与飞行翻滚_1080p.mp4'
patch=R/'work/label-repair.mp4'
temporary=R/'work/label-repaired-master.mp4'
previous=R/'work/roadster-before-label-fix.mp4'
first,stop=5260,5580
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def probe(p):
 return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(p)]))
def video(p):
 return next(x for x in probe(p)['streams'] if x['codec_type']=='video')
def audio_digest(p):
 proc=subprocess.Popen(['ffmpeg','-v','error','-i',str(p),'-map','0:a:0','-c:a','copy','-f','adts','-'],stdout=subprocess.PIPE)
 h=hashlib.sha256()
 while b:=proc.stdout.read(1024*1024):h.update(b)
 if proc.wait()!=0:raise RuntimeError('Could not verify copied AAC')
 return h.hexdigest()

assert not previous.exists(), 'Repair already applied or previous repair remains; inspect before rerunning'
a,b=video(movie),video(patch)
assert (a['width'],a['height'],a['r_frame_rate'],int(a['nb_frames']))==(1920,1080,'30/1',10081)
assert (b['width'],b['height'],b['r_frame_rate'],int(b['nb_frames']))==(1920,1080,'30/1',stop-first)
base_hash=sha(movie)
graph=f'[0:v]trim=end_frame={first},setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[0:v]trim=start_frame={stop},setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0[v]'
with (R/'work/qa/label-repair-encode.log').open('w',encoding='utf8') as log:
 subprocess.run(['ffmpeg','-hide_banner','-y','-i',str(movie),'-i',str(patch),'-filter_complex',graph,'-map','[v]','-map','0:a:0','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-r','30','-fps_mode','cfr','-c:a','copy','-movflags','+faststart',str(temporary)],check=True,stdout=log,stderr=subprocess.STDOUT)
v=video(temporary)
assert int(v['nb_frames'])==10081 and abs(float(v['duration'])-10081/30)<1/30
old_audio=audio_digest(movie)
assert old_audio==audio_digest(temporary), 'AAC content must remain unchanged'
movie.replace(previous)
temporary.replace(movie)
input_path=R/'work/qa/render-inputs.json'
shutil.copy2(input_path,R/'work/qa/base-render-inputs.json')
inputs=json.loads(input_path.read_text(encoding='utf8'))
for row in inputs['inputs']:
 current=sha(R/row['path'])
 if row['path']=='src/Film.tsx':row['sha256']=current;row['bytes']=(R/row['path']).stat().st_size
 else:assert current==row['sha256'], f"Unexpected source change: {row['path']}"
record={'reason':'s17 label changed from gas emitted to gas stopped; geometry/camera/audio unchanged','framesReplacedInclusive':[first,stop-1],'baseVideoSha256':base_hash,'patchSha256':sha(patch),'finalVideoSha256':sha(movie),'aacSha256Unchanged':old_audio,'finalFrames':10081,'joinPolicy':'Frame trims + concat; uniform final H.264 encode; original AAC copied without re-encoding','correctedSource':'src/Film.tsx','correctedSourceSha256':sha(R/'src/Film.tsx')}
inputs['frameRepair']=record
input_path.write_text(json.dumps(inputs,ensure_ascii=False,indent=2),encoding='utf8')
(R/'work/qa/label-repair.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print('Label repair complete: 320 frames replaced; AAC unchanged; total 10081 frames.')
