"""Full encoded decode plus independent timeline, captions and source checks."""
from pathlib import Path
import json,subprocess,re,hashlib,argparse
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--video',type=Path,default=ROOT/'output/C语言指针_从地址找到原件_1080p.mp4');a=p.parse_args();out=ROOT/'work/qa';out.mkdir(exist_ok=True,parents=True)
 n=load('src/narration.json');caps=load('src/captions-data.json')['cues'];story=load('src/story.json')['cues'];issues=[]
 meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(a.video)]));v=next(s for s in meta['streams'] if s['codec_type']=='video');au=next(s for s in meta['streams'] if s['codec_type']=='audio')
 for k,val in [('width',1920),('height',1080),('avg_frame_rate','30/1'),('nb_frames',str(n['durationFrames']))]:
  if v.get(k)!=val:issues.append(f'{k} mismatch')
 if abs(float(v['duration'])-float(au['duration']))>1/30:issues.append('Audio/video duration difference')
 if au.get('sample_rate')!='48000' or au.get('channels')!=2:issues.append('Audio format')
 if [c['id'] for c in story]!=[c['id'] for c in n['cues']]:issues.append('Narration cues missing')
 for i,c in enumerate(caps):
  if c['endFrame']<=c['startFrame'] or c['endFrame']>n['durationFrames']:issues.append('Caption duration')
  if len(c['text'])>24:issues.append('Caption too long '+c['text'])
  if i and caps[i-1]['endFrame']>c['startFrame']:issues.append('Caption overlap')
 r=subprocess.run(['ffmpeg','-hide_banner','-nostats','-threads','2','-filter_threads','2','-xerror','-err_detect','explode','-i',str(a.video),'-vf','blackdetect=d=0.2:pix_th=0.08:pic_th=0.98','-af','silencedetect=noise=-55dB:d=1.2,loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-progress','pipe:1','-f','null','NUL'],capture_output=True,text=True,encoding='utf8',errors='replace')
 (out/'full-decode.log').write_text(r.stderr,encoding='utf8');black=re.findall(r'black_start:[^\r\n]+',r.stderr);silence=re.findall(r'silence_start:[^\r\n]+',r.stderr);cnt=re.findall(r'^frame=(\d+)\s*$',r.stdout,re.M);loud=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',r.stderr)[-1])
 if r.returncode or not cnt or int(cnt[-1])!=n['durationFrames']:issues.append('Full decode/frame count')
 if black:issues.append('Black interval')
 # A designed fade-to-silence at the very end is allowed and reported.
 if any(float(re.search(r'silence_start:\s*([\d.]+)',s).group(1))<n['durationSec']-3.0 for s in silence):issues.append('Long silence before ending')
 if float(loud['input_tp'])>-1:issues.append('True peak > -1dBTP')
 if not -17.5<float(loud['input_i'])<-13.5:issues.append('Loudness outside target')
 report={'passed':not issues,'video':str(a.video.resolve()),'sha256':sha(a.video),'bytes':a.video.stat().st_size,'metadata':meta,'decodedFrames':int(cnt[-1]) if cnt else None,'captionCount':len(caps),'blackIntervals':black,'silenceIntervals':silence,'loudness':loud,'issues':issues,'sourceHashes':{str(p.relative_to(ROOT)):sha(p) for p in sorted((ROOT/'src').glob('*')) if p.is_file()},'subjectiveListeningChecked':False,'uninterruptedHumanViewingChecked':False}
 (out/'delivery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:report[k] for k in ['passed','sha256','decodedFrames','captionCount','blackIntervals','silenceIntervals','loudness','issues']},ensure_ascii=False,indent=2));assert not issues,issues
if __name__=='__main__':main()
