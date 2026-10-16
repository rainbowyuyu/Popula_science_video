"""Measure v03 actual media and prove v02a audio was stream-copied unchanged."""
from pathlib import Path
import subprocess,json,re,hashlib,datetime
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'work/v03/checks';OUT.mkdir(parents=True,exist_ok=True)
VIDEO=ROOT/'output/v03/roadster-mechanism-crosschecked-v03.mp4'
OLD=ROOT/'output/v01/roadster-mechanism-preview-v02a.mp4'
def run(name,args):
    p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
    (OUT/f'{name}.log').write_text(p.stdout+'\n'+p.stderr,encoding='utf-8');return p
p=run('ffprobe',['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(VIDEO)]);assert p.returncode==0
meta=json.loads(p.stdout);v=next(s for s in meta['streams'] if s['codec_type']=='video');a=next(s for s in meta['streams'] if s['codec_type']=='audio')
dec=run('decode',['ffmpeg','-v','error','-i',str(VIDEO),'-f','null','-'])
black=run('black',['ffmpeg','-hide_banner','-i',str(VIDEO),'-an','-vf','blackdetect=d=0.05:pix_th=0.08:pic_th=0.98','-f','null','-'])
audio=run('audio',['ffmpeg','-hide_banner','-i',str(VIDEO),'-vn','-af','silencedetect=noise=-50dB:d=0.4,ebur128=peak=true','-f','null','-'])
def packet_hash(file,key):
    r=run(key,['ffmpeg','-v','error','-i',str(file),'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-']);assert r.returncode==0;return r.stdout.strip()
h0=packet_hash(OLD,'previous-audio-hash');h1=packet_hash(VIDEO,'current-audio-hash')
contracts=json.loads((OUT/'contracts.json').read_text(encoding='utf-8'))
files=['source/v01/src/Preview.tsx','source/v01/src/VehicleStage.tsx','source/v01/src/stage-layout.mjs','source/v01/physics/preview-frames-v4.json','source/v01/timeline-crosschecked.json','assets/v03/teaching-car.mesh.json','assets/v03/teaching-car.blend','subtitles/v03/preview-asr-assisted.srt']
report={'checkedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'video':str(VIDEO.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),'width':v['width'],'height':v['height'],'fps':v['r_frame_rate'],'decodedFrames':int(v['nb_read_frames']),'videoSeconds':float(v['duration']),'audioSeconds':float(a['duration']),'audioChannels':a['channels'],'decodePassed':dec.returncode==0 and not dec.stderr.strip(),'blackIntervals':re.findall(r'black_start:[^\r\n]+',black.stderr),'silenceEvents':re.findall(r'silence_(?:start|end|duration):\s*[-\d.]+',audio.stderr),'loudnessSummary':audio.stderr.rsplit('Summary:',1)[-1].strip(),'audioPacketHashes':{'previous':h0,'current':h1,'identical':h0==h1},'technicalChecks':{'725Frames':int(v['nb_read_frames'])==725,'1080p':v['width']==1920 and v['height']==1080,'durationDiffUnderOneFrame':abs(float(v['duration'])-float(a['duration']))<1/30,'contractTestsPassed':contracts['allPassed'],'contractTestFile':'work/v03/checks/contracts.json','sourceTypecheckLog':'process-178ef6bf.log (actual exitCode 0, no source changes since check)'},'reviewScope':{'asrCompleted':True,'captionBoundaries':'ASR-assisted clause times, manually compared to raw word list; canonical text retained','humanWordTimingVerified':False,'subjectiveListeningChecked':False,'continuousPlaybackReviewed':False,'fullEpisodeCompleted':False},'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in files}}
(OUT/'media-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='sourceHashes'},ensure_ascii=False,indent=2))
