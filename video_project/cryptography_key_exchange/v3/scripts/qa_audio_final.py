"""Read-only encoded-delivery QA: bounded memory, full sequential decode."""
import argparse,json,subprocess,re,hashlib,sys
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='replace')
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def run(args):
    return subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace')

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
    return h.hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--video',type=Path,required=True)
    p.add_argument('--output-dir',type=Path,default=ROOT/'work/qa');args=p.parse_args()
    video=args.video.resolve();out=args.output_dir;out.mkdir(exist_ok=True,parents=True)
    if not video.is_relative_to(ROOT.resolve()):raise SystemExit('Only this V3 project output can be checked.')
    if not video.is_file():raise SystemExit('Final MP4 does not exist yet; no verification result written.')
    before=video.stat();probe=run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)])
    if probe.returncode:raise RuntimeError(probe.stderr)
    meta=json.loads(probe.stdout);v=next(x for x in meta['streams'] if x['codec_type']=='video');a=next(x for x in meta['streams'] if x['codec_type']=='audio')
    timeline=json.loads((ROOT/'src/narration.json').read_text(encoding='utf8'));fail=[]
    frozen=json.loads((ROOT/'work/audio/audio-qa.json').read_text(encoding='utf8'))
    fps=timeline['fps']
    if fps!=30 or abs(timeline['durationFrames']/fps-timeline['durationSec'])>1e-8:
        fail.append('Invalid V3 narration frame/duration contract')
    if abs(frozen['durationSec']-timeline['durationSec'])>1e-8 or frozen['samples']!=round(timeline['durationFrames']*48000/fps):
        fail.append('Audio QA sample count no longer matches the frozen timeline')
    for key,expected in [('width',1920),('height',1080),('avg_frame_rate','30/1'),('nb_frames',str(timeline['durationFrames']))]:
        if v.get(key)!=expected:fail.append(f'{key}: {v.get(key)} expected {expected}')
    if v.get('codec_name')!='h264':fail.append('Unexpected video codec')
    # Remotion's JPEG frame path can preserve full-range 8-bit 4:2:0.
    # FFmpeg reports that valid format as yuvj420p rather than yuv420p.
    if v.get('pix_fmt') not in ('yuv420p','yuvj420p'):fail.append('Unexpected video pixel format: expected 8-bit 4:2:0')
    if v.get('pix_fmt')=='yuvj420p' and v.get('color_range')!='pc':fail.append('Full-range pixel format has inconsistent range metadata')
    if a.get('codec_name')!='aac' or a.get('sample_rate')!='48000' or a.get('channels')!=2:fail.append('Audio codec/format')
    if abs(float(v['duration'])-timeline['durationSec'])>1/30:fail.append('Video duration differs from frozen narration')
    if abs(float(v['duration'])-float(a['duration']))>1/30:fail.append('A/V duration difference > one frame')
    if abs(float(v.get('start_time',0))-float(a.get('start_time',0)))>1/30:fail.append('A/V initial timestamps differ > one frame')
    if abs(float(v.get('start_time',0)))>1/30 or abs(float(a.get('start_time',0)))>1/30:fail.append('Initial presentation timestamp is not near zero')
    q=run(['ffmpeg','-hide_banner','-nostats','-threads','2','-filter_threads','2','-xerror','-err_detect','explode','-i',str(video),
        '-map','0:v:0','-map','0:a:0','-vf','blackdetect=d=0.2:pix_th=0.08:pic_th=0.98',
        '-af','silencedetect=noise=-55dB:d=1,loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json',
        '-progress','pipe:1','-f','null','NUL'])
    (out/'encoded-decode-audio.log').write_text(q.stderr,encoding='utf8')
    if q.returncode:fail.append('Full decode failed')
    decodedCounts=re.findall(r'^frame=(\d+)\s*$',q.stdout,re.M)
    decodedFrames=int(decodedCounts[-1]) if decodedCounts else None
    if decodedFrames!=timeline['durationFrames']:fail.append(f'Actual decoded frame count {decodedFrames} differs from {timeline["durationFrames"]}')
    black=re.findall(r'black_start:[^\r\n]+',q.stderr);silence=re.findall(r'silence_start:[^\r\n]+',q.stderr)
    if black:fail.append('Black intervals >= 0.2 seconds')
    if silence:fail.append('Silence >= 1 second')
    loud={};matches=re.findall(r'\{\s*"input_i"[\s\S]*?\}',q.stderr)
    if matches:loud=json.loads(matches[-1])
    else:fail.append('Loudness measurement missing')
    if loud and float(loud['input_tp'])>-1:fail.append('Encoded true peak > -1 dBTP')
    if loud and not -17<=float(loud['input_i'])<=-14:fail.append('Unexpected integrated loudness')
    digest=sha(video);after=video.stat()
    stable=before.st_size==after.st_size and before.st_mtime_ns==after.st_mtime_ns
    if not stable:fail.append('Video changed during verification')
    report={'video':str(video),'sha256':digest,'bytes':after.st_size,'metadata':meta,'expectedFrames':timeline['durationFrames'],
        'actualDecodedFrames':decodedFrames,'expectedDurationSec':timeline['durationSec'],'sourceNarrationSha256':sha(ROOT/'src/narration.json'),
        'colorEncoding':{'pixelFormat':v.get('pix_fmt'),'range':v.get('color_range'),'matrix':v.get('color_space'),
            'note':'Full-range yuvj420p is valid 8-bit 4:2:0; range metadata is preserved, not relabeled without pixel conversion.'},
        'blackIntervals':black,'longSilence':silence,'loudness':loud,'fullDecodePassed':q.returncode==0,
        'fileStableDuringCheck':stable,'failures':fail,'passed':not fail,'subjectiveListeningChecked':False,
        'reviewBoundary':'Technical full-decode verification; no claim of complete subjective audio/video review or semantic alignment.'}
    (out/'encoded-final.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({k:report[k] for k in ['sha256','bytes','blackIntervals','longSilence','loudness','failures']},ensure_ascii=False,indent=2))
    if fail:raise SystemExit(1)

if __name__=='__main__':main()
