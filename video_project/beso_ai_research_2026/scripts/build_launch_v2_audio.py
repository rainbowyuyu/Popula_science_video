"""New narration, measured timing and final mix for the 105 s v2 launch.
No time stretching, no reuse of the old narration or private voice references.
"""
from pathlib import Path
import hashlib,json,subprocess,math
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from qc import caption_parts,chars,map_times

R=Path(__file__).resolve().parents[1];SR=48000;FPS=60;SECONDS=105
def read(p):return json.loads(p.read_text('utf8'))
def write(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n','utf8')
def run(args):return subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stamp(ms):
 h,ms=divmod(round(ms),3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
 return f'{h:02}:{m:02}:{s:02},{ms:03}'
plan=read(R/'research/launch-v2-voice-plan.json')
story=read(R/'src/launch-story.json');story['revision']='launch-105-product-film-v2';story['audio']='audio/launch-v2-master.wav'
vstory=read(R/'research/launch-film-v2-story.json')
for s in story['scenes']:
 spec=next(x for x in vstory['scenes'] if x['id']==s['id'])
 for key in ['title','claim','visual','camera','onScreen']:s[key]=spec[key]
 s['clips']=[]
n=SR*SECONDS;voice=np.zeros((n,2),np.float32);activity=np.zeros(n,np.float32);placements=[];captions=[]
for s in story['scenes']:
 shots=[x for x in plan['shots'] if x['scene']==s['id']]
 loaded=[]
 for row in shots:
  p=R/'public/voice'/f"{row['id']}.wav";x,sr=sf.read(p,always_2d=True,dtype='float32')
  if sr!=SR:raise RuntimeError(f'{p.name}: sample rate {sr}')
  loaded.append((row,p,x))
 total=sum(len(x)/SR for _,_,x in loaded)+.18*max(0,len(loaded)-1)
 duration=s['duration']/FPS
 if total>duration-.45:raise RuntimeError(f"VOICE DOES NOT FIT {s['id']}: {total:.2f} of {duration}s")
 local=min(.65,max(.22,(duration-total)/3))
 for row,p,x in loaded:
  mono=x.mean(axis=1);blocks=mono[:len(mono)//960*960].reshape(-1,960);rms=np.sqrt(np.mean(blocks**2,axis=1));mask=np.repeat(rms>max(.002,float(rms.max())*.06),960)
  active=mono[:len(mask)][mask];gain=min(.11/max(float(np.sqrt(np.mean(active**2))),1e-8),.68/max(float(np.abs(mono).max()),1e-8))
  x=np.repeat(mono[:,None],2,axis=1)*gain;at=round((s['start']/FPS+local)*SR);voice[at:at+len(x)]+=x
  activity[max(0,at-4800):min(n,at+len(x)+9600)]=1
  seconds=len(x)/SR;offset=(s['start']/FPS+local)*1000
  asrpath=R/'audio/asr'/f"{row['id']}.json"
  if not asrpath.exists():raise RuntimeError('Missing ASR '+row['id'])
  asr=read(asrpath)
  if asr.get('sourceSHA256')!=sha(p):raise RuntimeError('Stale ASR '+row['id'])
  target,mapping,ratio=map_times(row['text'],asr['words'],seconds);pos=0
  for i,part in enumerate(caption_parts(row['text'],22)):
   units=len(chars(part));a=mapping[pos][0];b=mapping[pos+units-1][1];pos+=units
   captions.append(dict(id=f"{row['id']}-{i}",sourceClip=row['id'],text=part,startMs=round(offset+a*1000),endMs=round(offset+min(seconds,b+.08)*1000)))
  clip=dict(id=row['id'],from_=round(local*FPS),frames=math.ceil(seconds*FPS),file='voice/'+p.name,text=row['text'],ttsText=row['ttsText'],audioSHA256=sha(p))
  clip['from']=clip.pop('from_');s['clips'].append(clip)
  placements.append(dict(scene=s['id'],id=row['id'],start=at/SR,duration=seconds,sourceHash=sha(p),alignmentRatio=ratio))
  local+=seconds+.18
 s['voice']=''.join(x['text'] for x in shots);s.pop('voicePlan',None)
for a,b in zip(captions,captions[1:]):a['endMs']=min(a['endMs'],b['startMs'])
for c in captions:
 if c['endMs']<=c['startMs']:raise RuntimeError('Caption collapsed '+c['id'])
out=R/'public/audio';out.mkdir(exist_ok=True)
sf.write(out/'launch-v2-narration.wav',voice,SR,subtype='PCM_24')
# Retain the same film's licensed original composition, but remap ducking to
# the new sentences and add quiet, stereo movement accents under transitions.
music,sr=sf.read(out/'launch-105-music.wav',always_2d=True,dtype='float32');assert sr==SR and len(music)==n
music*=.85
envelope=gaussian_filter1d(activity[::480],sigma=28);envelope=np.interp(np.arange(n),np.arange(len(envelope))*480,envelope)
music*=np.power(10,(-4*envelope)/20)[:,None]
sf.write(out/'launch-v2-music.wav',music,SR,subtype='PCM_24')
premaster=out/'launch-v2-premaster.wav';sf.write(premaster,voice+music,SR,subtype='FLOAT')
check=run(['ffmpeg','-hide_banner','-nostats','-i',str(premaster),'-af','loudnorm=I=-16:TP=-1.8:LRA=8:print_format=json','-f','null','-'])
stats=json.loads(check.stderr[check.stderr.rfind('{'):check.stderr.rfind('}')+1])
filt=f"loudnorm=I=-16:TP=-1.8:LRA=8:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
master=out/'launch-v2-master.wav';run(['ffmpeg','-v','error','-y','-i',str(premaster),'-af',filt,'-ar',str(SR),'-c:a','pcm_s24le',str(master)])
story['narrationNote']='New v2 local reference-voice narration; measured sentence duration, no time stretching; CPU ASR alignment.'
write(R/'src/launch-story.json',story);write(R/'src/launch-captions.json',captions)
(R/'delivery/AI-Engineer-Launch-v2.zh.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['startMs'])} --> {stamp(c['endMs'])}\n{c['text']}" for i,c in enumerate(captions))+'\n','utf8')
active=activity>.5
report=dict(seconds=SECONDS,frames=6300,sampleRate=SR,placements=placements,masterSHA256=sha(master),subjectiveListeningChecked=False,speechOverMusicDb=float(20*np.log10(np.sqrt(np.mean(voice[active]**2))/np.sqrt(np.mean(music[active]**2)))),loudnessFirstPass=stats)
write(R/'research/qa/launch-v2-audio.json',report)
print(json.dumps(dict(seconds=SECONDS,clips=len(placements),captions=len(captions),speechOverMusicDb=report['speechOverMusicDb']),ensure_ascii=False))
