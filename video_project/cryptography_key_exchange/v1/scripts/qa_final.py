"""Verify the actual encoded deliverable, separately from source/still review."""
import json,subprocess,re,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
video=ROOT/'delivery/密码学_公开的传话_1080p.mp4'
out=ROOT/'work/qa';out.mkdir(exist_ok=True,parents=True)
def run(args):
    return subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
probe=run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)])
assert probe.returncode==0,probe.stderr
meta=json.loads(probe.stdout);v=next(x for x in meta['streams'] if x['codec_type']=='video');a=next(x for x in meta['streams'] if x['codec_type']=='audio')
timeline=json.loads((ROOT/'src/timeline-data.json').read_text(encoding='utf8'))
fail=[]
for key,expected in [('width',1920),('height',1080),('avg_frame_rate','30/1'),('nb_frames',str(timeline['durationFrames']))]:
    if v.get(key)!=expected:fail.append(f'{key}: {v.get(key)} expected {expected}')
if a.get('sample_rate')!='48000' or a.get('channels')!=2:fail.append('Audio format')
if abs(float(v['duration'])-float(a['duration']))>1/30:fail.append('A/V duration difference > one frame')
q=run(['ffmpeg','-hide_banner','-nostats','-i',str(video),'-vf','blackdetect=d=0.2:pix_th=0.08:pic_th=0.98','-af','silencedetect=noise=-55dB:d=1,loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','NUL'])
(out/'encoded-decode-audio.log').write_text(q.stderr,encoding='utf8')
if q.returncode:fail.append('Full decode failed')
black=re.findall(r'black_start:[^\r\n]+',q.stderr);silence=re.findall(r'silence_start:[^\r\n]+',q.stderr)
if black:fail.append('Black intervals')
if silence:fail.append('Silence >= 1s')
loud={}
matches=re.findall(r'\{\s*"input_i"[\s\S]*?\}',q.stderr)
if matches:loud=json.loads(matches[-1])
if loud and float(loud['input_tp'])>-1:fail.append('Encoded true peak > -1dBTP')
if loud and not -17<=float(loud['input_i'])<=-14:fail.append('Unexpected integrated loudness')
report={'video':str(video),'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'bytes':video.stat().st_size,'metadata':meta,'blackIntervals':black,'longSilence':silence,'loudness':loud,'fullDecodePassed':q.returncode==0,'failures':fail,'reviewBoundary':'Technical verification only; representative stills and short playback are documented separately. No claim of complete subjective audio/video review.'}
(out/'encoded-final.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:report[k] for k in ['sha256','bytes','blackIntervals','longSilence','loudness','failures']},ensure_ascii=False,indent=2))
assert not fail,fail
