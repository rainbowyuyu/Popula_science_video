"""Decode and measure the delivered file; save actual encoded boundary frames."""
from pathlib import Path
import json,re,subprocess,math
from PIL import Image,ImageDraw
from assemble import ROOT,WORK,OUT,probe,sha
Q=ROOT/'work/v06/qa';Q.mkdir(parents=True,exist_ok=True)
V=OUT/'Roadster_倒挂与飞行翻滚_1080p.mp4'
c=json.loads((WORK/'edit-contract.json').read_text(encoding='utf8'))
info=probe(V);v=next(s for s in info['streams'] if s['codec_type']=='video');a=next(s for s in info['streams'] if s['codec_type']=='audio')
checks={
    '9939frames':int(v['nb_frames'])==c['totalFrames'],
    '1080p':(v['width'],v['height'])==(1920,1080),
    '30fps':v['avg_frame_rate']=='30/1',
    'audio48kstereo':a['sample_rate']=='48000' and a['channels']==2,
    'audioPictureDuration':abs(float(v['duration'])-float(a['duration']))<1/30,
    'length':abs(float(v['duration'])-c['totalSec'])<1/30000,
    'V05unchanged':sha(ROOT/'output/v05/Roadster_倒挂与飞行翻滚_1080p.mp4')==c['bodySourceSha256'],
}
p=subprocess.run(['ffmpeg','-hide_banner','-threads','6','-i',str(V),'-vf','blackdetect=d=0.1:pix_th=0.02:pic_th=0.99',
    '-af','silencedetect=n=-50dB:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace')
(Q/'decode-audio.log').write_text(p.stderr,encoding='utf8')
levels=json.loads(re.findall(r'\{[^{}]+\}',p.stderr,re.S)[-1]);checks.update({
    'fullDecode':p.returncode==0,'noBlackSegments':'black_start:' not in p.stderr,
    'noLongSilence':'silence_start:' not in p.stderr,
    'integratedLoudness':abs(float(levels['input_i'])+16)<.5,
    'AACTruePeak':float(levels['input_tp'])<=-1,
})
# Inspect presentation timestamps at every frame, including the concat boundary.
ts=subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp','-of','json',str(V)],encoding='utf8')
frames=json.loads(ts)['frames'];ticks=[int(f['best_effort_timestamp']) for f in frames]
checks['presentationTimestamps']=len(ticks)==9939 and all(t==i*3000 for i,t in enumerate(ticks))
indices=sorted(set([0,30,60,90,120,150,180,210,240,270,300,330,360,390,420,450,480,510,540,570]+[n+d for n in c['cuts'] for d in [-3,-2,-1,0,1,2,3]]))
fd=Q/'frames';fd.mkdir(exist_ok=True)
select='+'.join(f'eq(n,{i})' for i in indices)
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(V),'-t','20','-vf',f"select='{select}',scale=640:360",'-fps_mode','vfr',str(fd/'frame-%03d.jpg')],check=True)
files=sorted(fd.glob('frame-*.jpg'))
if len(files)!=len(indices):raise RuntimeError(f'QA extraction mismatch: {len(files)} vs {len(indices)}')
for group in range(math.ceil(len(files)/18)):
    chunk=list(zip(indices,files))[group*18:(group+1)*18]
    canvas=Image.new('RGB',(1440,math.ceil(len(chunk)/3)*296),'#eae7df');draw=ImageDraw.Draw(canvas)
    for j,(n,file) in enumerate(chunk):
        x=(j%3)*480;y=(j//3)*296
        canvas.paste(Image.open(file).resize((480,270)),(x,y));draw.text((x+8,y+276),f'frame {n} / {n/30:.3f}s',fill='#20333b')
    canvas.save(Q/f'contact-{group+1}.jpg',quality=92)
report={'videoSha256':sha(V),'checks':checks,'passed':all(checks.values()),'encodedAudio':levels,'duration':v['duration'],
    'reviewFrameIndices':indices,'frameCount':len(ticks),'subjectiveAudioReview':False,
    'visualReview':'Encoded contact sheets and real-time playback must be inspected separately.'}
(Q/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
if not report['passed']:raise SystemExit(1)
