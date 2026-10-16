"""雨后追光: original V06 acoustic 6/8 score and restrained rain/water sound.

The sampler alone is reused; this melody, harmony, note events and master are
new. Instrument recordings: VSCO 2 Community Edition, CC0.
"""
from pathlib import Path
import json,hashlib,subprocess,re,sys
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfilt,oaconvolve
from acoustic_bank import AcousticBank
ROOT=Path(__file__).resolve().parents[1];SR=48000;SEED=2026101176;TITLE='雨后追光'
sys.stdout.reconfigure(encoding='utf8')
def jd(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n','utf8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
CHORDS={
 'FM9':(41,[57,60,64,67]),'CE':(40,[55,60,64,67]),
 'Dm7':(38,[57,60,62,65]),'BbM7':(46,[57,62,65,69]),
 'Gm9':(43,[57,58,62,65]),'Csus':(48,[55,60,65,67]),
 'Am7':(45,[55,60,64,67]),'Bb6':(46,[55,58,62,65]),
}
PROGRESSIONS=[['FM9','CE','Dm7','BbM7','FM9','Am7','Gm9','Csus'],
 ['Dm7','Am7','BbM7','FM9','Gm9','Dm7','Bb6','Csus'],
 ['BbM7','FM9','Gm9','CE','Dm7','Bb6','Csus','FM9']]
# Independent 6/8 melody. It asks in a rising phrase, then answers downward.
MELODY=[[(.18,69,2.1),(3.75,72,1.5)],[(.30,74,2.5),(4.3,72,1.0)],
 [(1.05,69,3.4)],[(.20,67,2.1),(3.8,65,1.6)],
 [(.15,69,1.8),(2.8,72,1.4),(4.6,76,1.1)],[(.48,74,3.0)],
 [(1.2,70,2.0),(4.1,69,1.1)],[(.25,67,3.2)]]
ANSWERS=[[(.2,77,3)],[(1.4,76,2.8)],[(.3,74,2),(3.8,72,1.4)],[(.4,69,3.6)],
 [(.2,70,2),(3.3,74,1.5)],[(1,72,3.1)],[(.4,69,2.1),(3.7,67,1.2)],[(.2,65,3.7)]]
def compose(tl):
 seconds=tl['duration']/tl['fps'];n=round(seconds*SR);bank=AcousticBank(SR);rng=np.random.default_rng(SEED)
 dry=np.zeros((n,2),np.float32);send=np.zeros_like(dry);events=[]
 def scene_at(t):return next((s['id'] for s in tl['scenes'] if s['start']<=t<s['end']),'references')
 def add(inst,note,at,dur,vel,pan=0,room=.25,var=0):
  start=max(0,round(at*SR));count=min(round(dur*SR),n-start)
  if count<=0:return
  w=bank.note(inst,note,count/SR,vel,var);mid=w.mean(axis=1);side=(w[:,0]-w[:,1])*.24;a=(pan+1)*np.pi/4
  st=np.stack([mid*np.cos(a)*1.414+side,mid*np.sin(a)*1.414-side],axis=1)
  dry[start:start+count]+=st;send[start:start+count]+=st*room
  events.append({'instrument':inst,'midi':note,'at':round(at,4),'seconds':round(dur,4),'velocity':round(vel,4)})
 eighth=60/168;bar=0;t=.6
 while t<seconds-5.9:
  pos=bar%8;phrase=bar//8;scene=scene_at(t);p=t/seconds
  investigate=smooth((p-.13)/.12)*(1-smooth((p-.68)/.10));opening=1-smooth(t/22)
  line=ANSWERS if phrase%3==2 else MELODY;prog=PROGRESSIONS[1 if scene=='secondary' else 2 if scene in ['circle','return'] else 0]
  bass,ch=CHORDS[prog[pos]];beat=eighth*(1.035 if pos==7 else .993 if pos==3 else 1);dur=6*beat
  energy=.64+.16*investigate-.12*opening;variation=lambda:float(rng.uniform(-.007,.008))
  add('piano',bass+12,t+variation(),dur+1.1,.34*energy,-.14,.24,bar)
  offsets=[(.72,0),(3.52,2)] if pos%2==0 else [(1.45,1),(4.3,3)]
  if t<10:offsets=offsets[:1]
  for off,ix in offsets:add('piano',ch[ix],t+off*beat+variation(),2.65,.20*energy,-.06+ix*.04,.30,bar+ix)
  for k,(off,note,held) in enumerate(line[pos]):
   if t<12 and k>0:continue
   if prog[pos] in ['BbM7','Bb6','Gm9'] and note==76:note=74
   add('piano',note,t+off*beat+variation(),max(2.0,held*beat+.8),.48*energy,.10,.32,bar+k)
  harp=smooth((t-15)/20)*(1-.5*smooth((p-.93)/.04))
  if pos in [1,4,6]:add('harp',ch[1]+12,t+2.55*beat,2.5,.16*energy*harp,.27,.34,bar)
  if scene=='dispersion' and pos in [2,5]:
   for k,note in enumerate([ch[0]+12,ch[2]+12,ch[3]+12]):add('harp',note,t+(1.8+.36*k)*beat,2.0,.075*energy,.18,.35,bar+k)
  strings=smooth((t-30)/35)*(1-.42*smooth((p-.91)/.06))
  if bar%2==0:
   add('cello',bass+12,max(0,t-.10),2*dur+.4,.13*energy*strings,-.15,.38,bar)
   add('viola',ch[0],max(0,t-.10),2*dur+.5,.09*energy*strings,.16,.42,bar)
  pulse=smooth((t-50)/40)*(1-smooth((p-.91)/.04))
  if pos not in [3,7]:add('pizz',bass+12,t+.035,1.4,.17*energy*pulse,-.03,.17,bar)
  if scene in ['angle','cone','observer'] and pos in [1,5]:add('tap',60,t+3*beat,.28,.03*energy,0,.07,bar)
  t+=dur;bar+=1
 # A distinct resolving F(add9) chord connects the living rainbow to sources.
 cadence=seconds-6.4
 for k,note in enumerate([41,53,60,65,69,72,79]):add('piano',note,cadence+.07*k,6.25,.22 if k<3 else .26,-.10+.035*k,.34,k)
 # Small acoustic room, fixed seed, no modulated shimmer under speech.
 length=round(1.7*SR);tt=np.arange(length)/SR;ir=rng.normal(0,1,(length,2)).astype(np.float32)*np.exp(-tt[:,None]/.32);ir[:round(.023*SR)]=0
 ir=sosfilt(butter(2,3700,fs=SR,output='sos'),ir,axis=0).astype(np.float32);ir/=max(1e-7,float(np.sqrt(np.sum(ir**2,axis=0)).max()));ir*=.23
 for d,g in [(.032,.12),(.054,.075),(.091,.038)]:ir[round(d*SR),0]+=g;ir[round((d+.009)*SR),1]+=g*.9
 score=dry.copy()
 for c in range(2):score[:,c]+=oaconvolve(send[:,c],ir[:,c],mode='full')[:n]
 score=sosfilt(butter(2,45,fs=SR,btype='highpass',output='sos'),score,axis=0).astype(np.float32)
 band=sosfilt(butter(2,[2100,4200],fs=SR,btype='bandpass',output='sos'),score,axis=0);score-=band.astype(np.float32)*.27
 fadein=smooth(np.arange(n)/(SR*1.6));fadeout=smooth((n-1-np.arange(n))/(SR*2.5));score*=fadein[:,None]*fadeout[:,None]
 score*=10**(-32/20)/max(1e-8,float(np.sqrt(np.mean(score.astype(np.float64)**2))))
 jd(ROOT/'research/music/composition-v06.json',{'title':TITLE,'seed':SEED,'meter':'6/8','tempoDottedQuarterBpm':56,'tonality':'F major / D minor','bars':bar,'events':events,'reusedPriorMelody':False,'instruments':list(bank.files),'sampleLicense':'CC0-1.0','subjectiveListeningChecked':False})
 return score
def sfx(tl,n):
 rng=np.random.default_rng(SEED+20);noise=rng.normal(0,1,(n,2)).astype(np.float32);out=sosfilt(butter(2,[450,2300],fs=SR,btype='bandpass',output='sos'),noise,axis=0).astype(np.float32)
 time=np.arange(n)/SR;env=np.zeros(n,np.float32)
 for s in tl['scenes']:
  level={'street':.0045,'drop':.0009,'return':.0033}.get(s['id'],0)
  if level:env+=level*smooth((time-s['start']+1.0)/2.0)*(1-smooth((time-s['end']+1.0)/2.0))
 out*=env[:,None]*(.88+.12*np.sin(time[:,None]*.33))
 # Occasional tiny droplets in the opening and experiment; designed, not field audio.
 for s in tl['scenes']:
  if s['id'] not in ['street','return']:continue
  for at in np.arange(s['start']+1.7,s['end']-.5,3.2):
   dur=.18;tt=np.arange(round(dur*SR))/SR;hz=rng.uniform(1100,1900);w=np.sin(2*np.pi*hz*(tt-.11*tt*tt))*np.exp(-tt*32)*smooth(tt/.006)*.0007
   a=round(at*SR);b=min(n,a+len(w));out[a:b,0]+=w[:b-a];out[a:b,1]+=w[:b-a]*.7
 return out
def main():
 tl=json.loads((ROOT/'src/timeline.json').read_text('utf8'));seconds=tl['duration']/tl['fps'];n=round(seconds*SR)
 score=compose(tl);fx=sfx(tl,n);voice,sr=sf.read(ROOT/'public/audio/narration.wav',dtype='float32');assert sr==SR
 voice=np.pad(voice,(0,max(0,n-len(voice))))[:n];time=np.arange(n)/SR;activity=np.zeros(n,np.float32)
 # One anticipation/release shape for each utterance; adjacent phrases overlap,
 # preventing syllable-scale pumping. Music rises only after real phrase gaps.
 for c in tl['clips']:
  activity=np.maximum(activity,(smooth((time-c['start']+.10)/.15)*(1-smooth((time-c['end'])/1.15))).astype(np.float32))
 duck=10**((-4.5*activity)/20);tail=smooth((time-tl['scenes'][-1]['start'])/1.25);bed=score*duck[:,None]*(1+.45*tail[:,None])+fx
 mix=bed+voice[:,None]
 audio=ROOT/'public/audio';sf.write(audio/'score.wav',score,SR,subtype='PCM_24');sf.write(audio/'sfx.wav',fx,SR,subtype='PCM_24');sf.write(audio/'bed.wav',bed,SR,subtype='PCM_24');sf.write(audio/'premaster.wav',mix,SR,subtype='PCM_24')
 # WAV headroom is a little larger so AAC overshoot can still stay <= -1.5dBTP.
 cmd=['ffmpeg','-hide_banner','-i',str(audio/'premaster.wav'),'-af','loudnorm=I=-16:TP=-2.0:LRA=7:print_format=json','-f','null','-'];r=subprocess.run(cmd,capture_output=True,text=True,encoding='utf8',errors='replace',check=True);m=json.loads(re.findall(r'\{\s*"input_i".*?\}',r.stderr,re.S)[-1]);jd(ROOT/'research/audio/loudnorm-pass1-v06.json',m)
 filt=f'loudnorm=I=-16:TP=-2.0:LRA=7:measured_I={m["input_i"]}:measured_TP={m["input_tp"]}:measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:offset={m["target_offset"]}:linear=true:print_format=json'
 r=subprocess.run(['ffmpeg','-v','info','-y','-i',str(audio/'premaster.wav'),'-af',filt,'-ar',str(SR),'-c:a','pcm_s24le',str(audio/'master.wav')],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
 (ROOT/'research/audio/loudnorm-pass2-v06.txt').write_text(r.stderr,'utf8')
 final,sr=sf.read(audio/'master.wav',dtype='float32');active=activity>.7;vr=float(np.sqrt(np.mean(voice[active].astype(np.float64)**2)));br=float(np.sqrt(np.mean(bed[active].astype(np.float64)**2)))
 license={'title':TITLE,'composer':'rainbow鱼 original procedural arrangement','source':'scripts/score_mix_v06.py','composition':'original note events, no prior music master imported','sampleSource':'VSCO 2 Community Edition single instrument notes','sampleLicense':'CC0-1.0','sampleLicenseFile':'research/music/samples/LICENSE','scoreSHA256':sha(audio/'score.wav'),'masterSHA256':sha(audio/'master.wav'),'seed':SEED,'durationSeconds':len(final)/SR,'voiceMusicActiveRmsDifferenceDb':20*np.log10(vr/max(br,1e-8)),'humanListeningChecked':False}
 jd(ROOT/'research/music/music-history-entry-v06.json',license);jd(ROOT/'research/audio/mix-report-v06.json',license)
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(audio/'master.wav'),'-t','45','-c:a','aac','-b:a','192k',str(ROOT/'delivery/雨后追光_V06_声音预览.m4a')],check=True)
 # Equal-level raw/clean comparison, not represented as completed human review.
 for kind,p in [('raw',ROOT/'research/audio/raw/r001-protected.wav'),('clean',audio/'r001.wav')]:
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(p),'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar','48000',str(ROOT/f'delivery/V06_片头_{kind}_AB.wav')],check=True)
 print(json.dumps(license,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':main()
