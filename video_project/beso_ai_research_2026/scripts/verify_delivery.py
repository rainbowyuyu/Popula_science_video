"""Probe the complete movie, decode it and measure its final AAC, without playback claims."""
from pathlib import Path
import hashlib,json,re,subprocess,sys
R=Path(__file__).resolve().parents[1];F=R/'output/beso_ai_research_1080p60.mp4';D=R/'delivery';D.mkdir(exist_ok=True)
def run(args):
    r=subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace')
    if r.returncode:raise RuntimeError(r.stderr[-3000:])
    return r
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        while b:=f.read(2**20):h.update(b)
    return h.hexdigest()
story=json.loads((R/'src/beso-story.json').read_text('utf8'))
probe=json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(F)]).stdout)
v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['r_frame_rate'])==(1920,1080,'60/1')
assert int(v['nb_frames'])==story['duration']
assert abs(float(v['duration'])-float(a['duration']))<.06
decode=run(['ffmpeg','-hide_banner','-nostats','-v','warning','-i',str(F),'-f','null','-'])
(D/'decode.log').write_text(decode.stderr,'utf8')
analysis=run(['ffmpeg','-hide_banner','-nostats','-i',str(F),'-vf','blackdetect=d=0.10:pix_th=0.06:pic_th=0.985','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'])
(D/'technical-analysis.log').write_text(analysis.stderr,'utf8')
stats=json.loads(analysis.stderr[analysis.stderr.rfind('{'):analysis.stderr.rfind('}')+1])
black=re.findall(r'black_start:([^ ]+) black_end:([^ ]+) black_duration:([^\s]+)',analysis.stderr)
captions=json.loads((R/'src/beso-captions.json').read_text('utf8'))
overlaps=[c['id'] for p,c in zip(captions,captions[1:]) if c['startMs']<p['endMs']]
assert not overlaps
audio=json.loads((R/'research/qa/audio-final.json').read_text('utf8'))
report=dict(file=str(F),sha256=sha(F),width=v['width'],height=v['height'],fps=60,frames=int(v['nb_frames']),seconds=float(v['duration']),audioSeconds=float(a['duration']),videoCodec=v['codec_name'],audioCodec=a['codec_name'],audioSampleRate=a['sample_rate'],fullDecodePassed=True,decodeWarnings=decode.stderr,blackSegments=black,finalAAC=dict(integratedLUFS=float(stats['input_i']),truePeakDBTP=float(stats['input_tp']),LRA=float(stats['input_lra'])),captions=dict(count=len(captions),overlaps=overlaps,minDurationMs=min(c['endMs']-c['startMs'] for c in captions)),speechOverMusicDb=audio['speechOverMusicDb'],subjectiveListeningChecked=False,fullRealTimeViewingChecked=False,visualReview='See research/qa/visual-review.md for inspected frames and transition sequences; not a claim of continuous human real-time playback.')
(D/'technical-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
assert not black,black
assert -17<float(stats['input_i'])<-15
assert float(stats['input_tp'])<=-.8
print(json.dumps({k:report[k] for k in ['seconds','fps','frames','fullDecodePassed','blackSegments','finalAAC']},ensure_ascii=False),flush=True)
