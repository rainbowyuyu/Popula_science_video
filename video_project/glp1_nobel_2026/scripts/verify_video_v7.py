"""Decode the encoded V7 video, check basic media properties, and extract QA frames."""
from pathlib import Path
import argparse,subprocess,json,hashlib,re

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--video',required=True);p.add_argument('--out',required=True);args=p.parse_args()
video=(ROOT/args.video).resolve();out=(ROOT/args.out).resolve()
assert video.is_file() and out.is_relative_to(ROOT)
out.mkdir(exist_ok=True,parents=True)
def run(a):return subprocess.run(a,capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
tl=json.loads((ROOT/'src/timeline.json').read_text('utf8'))
probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_chapters','-show_format','-of','json',str(video)]).stdout)
v=next(s for s in probe['streams'] if s['codec_type']=='video')
a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['r_frame_rate'],v['pix_fmt'])==(1920,1080,'30/1','yuv420p')
assert int(v['nb_frames'])==tl['duration'] and a['sample_rate']=='48000'
assert v['color_space']==v['color_transfer']==v['color_primaries']=='bt709'
assert abs(float(probe['format']['duration'])-tl['duration']/30)<.08
check=run(['ffmpeg','-hide_banner','-nostdin','-v','info','-xerror','-i',str(video),'-map','0:v:0','-an','-vf','blackdetect=d=0.10:pix_th=0.1:pic_th=0.98,freezedetect=n=-45dB:d=8','-f','null','-'])
(out/'decode.log').write_text(check.stderr,'utf8')
black=[s for s in check.stderr.splitlines() if 'black_start:' in s]
freeze=[s for s in check.stderr.splitlines() if 'freeze_start:' in s or 'freeze_duration:' in s]
assert not black,'Unexpected black interval in encoded movie'
frames=sorted(set(int(c['start']+c['duration']*u) for c in tl['clips'] for u in [.18,.53,.85]))
frames+= [tl['clips'][-1]['end']+90,tl['duration']-30]
frames=sorted(set(frames))
frame_dir=out/'frames';frame_dir.mkdir(exist_ok=True)
assert not list(frame_dir.glob('*.jpeg')),'Need a fresh frame directory'
filter_path=out/'frame-filter.txt'
filter_path.write_text("select='"+'+'.join(f'eq(n,{f})' for f in frames)+"'",'utf8')
run(['ffmpeg','-hide_banner','-nostdin','-v','error','-xerror','-i',str(video),'-filter_script:v',str(filter_path),'-fps_mode','vfr','-q:v','2',str(frame_dir/'extract-%05d.jpeg')])
extracted=sorted(frame_dir.glob('extract-*.jpeg'));assert len(extracted)==len(frames)
for image,frame in zip(extracted,frames):image.rename(frame_dir/f'element-{frame:05d}.jpeg')
sha=hashlib.sha256()
with video.open('rb') as f:
 for b in iter(lambda:f.read(4*1024*1024),b''):sha.update(b)
result={'video':str(video),'videoSHA256':sha.hexdigest(),'technicalPass':True,'fullDecode':True,'blackIntervals':black,'freezeEventsRequireReview':freeze,'probe':probe,'extractedFrames':frames,'visualReview':'pending; extracted frames are not an automatic visual pass'}
(out/'technical.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'technicalPass':True,'frames':v['nb_frames'],'duration':probe['format']['duration'],'chapters':len(probe.get('chapters',[])),'blackIntervals':len(black),'freezeEvents':freeze,'samples':len(frames)},ensure_ascii=False))
