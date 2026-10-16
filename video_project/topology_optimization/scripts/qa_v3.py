from pathlib import Path
import json,subprocess,hashlib,re,math
import numpy as np,soundfile as sf
from PIL import Image,ImageOps,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1];out=R/'output/v3';Q=R/'delivery/v3';Q.mkdir(exist_ok=True)
movie=out/'书架为什么敢挖空_1080p.mp4'; t=json.loads((R/'public/v3/timeline.json').read_text('utf8'))
def run(args):return subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
info=json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(movie)]).stdout)
v=next(s for s in info['streams'] if s['codec_type']=='video');a=next(s for s in info['streams'] if s['codec_type']=='audio')
assert v['width']==1920 and v['height']==1080 and v['r_frame_rate']=='30/1'
assert int(v['nb_frames'])==t['duration'] and abs(float(info['format']['duration'])-t['seconds'])<.12
decode=run(['ffmpeg','-v','error','-i',str(movie),'-f','null','NUL']);assert not decode.stderr.strip()
measure=run(['ffmpeg','-hide_banner','-i',str(movie),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','NUL'])
match=re.findall(r'\{\s*"input_i"[\s\S]*?\}',measure.stderr);loud=json.loads(match[-1]);assert float(loud['input_tp'])<=-1
(Q/'loudness.json').write_text(json.dumps(loud,indent=2),encoding='utf8')
times=[]
for s in t['scenes']:
 for p in [.18,.52,.83]:times.append((f"{s['id']}-{p}",(s['start']+(s['end']-s['start'])*p)/30))
for s in t['scenes'][1:]:
 for d in [-.5,0,.5]:times.append((f"join-{s['id']}-{d}",s['start']/30+d))
stills=out/'qa';stills.mkdir(exist_ok=True)
for i,(name,sec) in enumerate(times):
 run(['ffmpeg','-v','error','-y','-ss',str(sec),'-i',str(movie),'-frames:v','1','-vf','scale=640:-1',str(stills/f'{i:03}.jpg')])
for batch in range(math.ceil(len(times)/15)):
 pairs=times[batch*15:(batch+1)*15];sheet=Image.new('RGB',(640*3,390*5),(237,237,232));draw=ImageDraw.Draw(sheet)
 for j,(name,sec) in enumerate(pairs):
  img=Image.open(stills/f'{batch*15+j:03}.jpg');x=(j%3)*640;y=(j//3)*390;sheet.paste(img,(x,y));draw.text((x+8,y+365),f'{sec:.2f}s | {name}',fill='#203b3e')
 sheet.save(Q/f'contact-{batch+1}.jpg',quality=90)
narr,sr=sf.read(R/'public/v3/narration.wav');score,_=sf.read(R/'public/v3/score.wav')
active=np.zeros(len(narr),bool)
for c in t['clips']:active[int(c['start']/30*sr):int(c['end']/30*sr)]=True
rms=lambda y:20*np.log10(max(1e-12,float(np.sqrt(np.mean(y**2)))))
ratio=rms(narr[active])-rms(score[active])
report={'movie':str(movie.relative_to(R)),'sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'durationSeconds':float(info['format']['duration']),'frames':int(v['nb_frames']),'resolution':[1920,1080],'fps':30,'audioSampleRate':a['sample_rate'],'fullDecode':True,'loudness':loud,'narrationMusicRmsDifferenceDb':ratio,'contentSamples':len(t['scenes'])*3,'transitionSamples':(len(t['scenes'])-1)*3,'sampleTimes':[{'label':n,'seconds':s} for n,s in times],'subtitleClips':len(t['captions']),'voiceTimeStretch':False,'manualReview':'See review.json for sampled visual checks; no claim of full human playback or listening.'}
assert all(c['start']<c['end']<=t['duration'] for c in t['clips'])
assert all(c['start']<c['end']<=t['duration'] and len(c['text'])<=24 for c in t['captions'])
assert all(a['end']<=b['start'] for a,b in zip(t['captions'],t['captions'][1:]))
report.update(maxCaptionCharacters=max(len(c['text']) for c in t['captions']),voice='rainbow personal reference / local Qwen3',brandImageSha256=hashlib.sha256((R/'public/v3/logo.png').read_bytes()).hexdigest(),audioAsrClips=len(json.loads((R/'research/v3/voice-check.json').read_text('utf8'))),subjectiveListeningChecked=False)
(Q/'qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='sampleTimes'},ensure_ascii=False,indent=2))
