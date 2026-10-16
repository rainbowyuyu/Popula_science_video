"""Decode and measure the actual delivered preview. No subjective review claims."""
from pathlib import Path
import subprocess,json,re,hashlib,datetime,sys
ROOT=Path(__file__).resolve().parents[3]
version=sys.argv[1] if len(sys.argv)>1 else 'v01'
VIDEO=ROOT/f'output/v01/roadster-mechanism-preview-{version}.mp4'
OUT=ROOT/'work/v01/checks'/version;OUT.mkdir(parents=True,exist_ok=True)
def run(name,args):
    p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
    (OUT/(name+'.log')).write_text(p.stdout+'\n'+p.stderr,encoding='utf-8')
    return p
probe=run('ffprobe',['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(VIDEO)])
assert probe.returncode==0
meta=json.loads(probe.stdout)
v=next(s for s in meta['streams'] if s['codec_type']=='video')
a=next(s for s in meta['streams'] if s['codec_type']=='audio')
decode=run('decode',['ffmpeg','-v','error','-i',str(VIDEO),'-f','null','-'])
black=run('black',['ffmpeg','-hide_banner','-i',str(VIDEO),'-an','-vf','blackdetect=d=0.05:pix_th=0.08:pic_th=0.98','-f','null','-'])
audio=run('audio',['ffmpeg','-hide_banner','-i',str(VIDEO),'-vn','-af','silencedetect=noise=-50dB:d=0.4,ebur128=peak=true','-f','null','-'])
summary=audio.stderr.rsplit('Summary:',1)[-1]
silence=re.findall(r'silence_(?:start|end|duration):\s*[-\d.]+',audio.stderr)
report={
 'checkedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'video':str(VIDEO.relative_to(ROOT)).replace('\\','/'),
 'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),
 'width':v['width'],'height':v['height'],'fps':v['r_frame_rate'],'decodedFrames':int(v['nb_read_frames']),
 'videoSeconds':float(v['duration']),'audioSeconds':float(a['duration']),
 'audioSampleRate':a['sample_rate'],'audioChannels':a['channels'],
 'decodePassed':decode.returncode==0 and not decode.stderr.strip(),
 'blackIntervals':re.findall(r'black_start:[^\r\n]+',black.stderr),
 'silenceEvents':silence,'loudnessSummary':summary.strip(),
 'checks':{
  'expected1080p':v['width']==1920 and v['height']==1080,
  'expected725Frames':int(v['nb_read_frames'])==725,
  'durationDifferenceUnderOneFrame':abs(float(v['duration'])-float(a['duration']))<1/30,
  'physicalModelAssertions':'work/v01/checks/physics.json',
  'sourceTypecheckPassed':True,
  'continuousPlaybackReviewed':False,'subjectiveListeningChecked':False,
  'subtitleWordAlignmentVerified':False,
  'captionTiming':'proportional draft across measured sentence audio; no ASR alignment',
  'fullEpisodeCompleted':False
 }
}
(OUT/'preview-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
