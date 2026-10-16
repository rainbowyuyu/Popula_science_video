from pathlib import Path
import json,subprocess,re,math
import numpy as np,soundfile as sf
R=Path(__file__).resolve().parents[1];P=R/'public/v3';Q=R/'research/v3';sr=48000
tl=json.loads((P/'timeline.json').read_text('utf8'));N=tl['duration']*1600
def ff(args):return subprocess.run(['ffmpeg','-hide_banner','-nostats',*args],capture_output=True,text=True,encoding='utf8',check=True)
def loud(path,target=-16,pre=''):
 r=ff(['-i',str(path),'-af',(pre+',' if pre else '')+f'loudnorm=I={target}:TP=-1.8:LRA=9:print_format=json','-f','null','NUL']);return json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',r.stderr)[-1])
source=P/'music/Cipher2.mp3';eq='highpass=f=45,lowpass=f=12000,equalizer=f=2600:t=q:w=0.8:g=-3'
measure=loud(source,-25,eq);norm=f'loudnorm=I=-25:TP=-4:LRA=10:measured_I={measure["input_i"]}:measured_TP={measure["input_tp"]}:measured_LRA={measure["input_lra"]}:measured_thresh={measure["input_thresh"]}:offset={measure["target_offset"]}:linear=true'
tmp=R/'tmp/music-normalized.wav';ff(['-v','error','-y','-i',str(source),'-af',eq+','+norm,'-ar',str(sr),'-ac','2',str(tmp)])
music,_=sf.read(tmp,dtype='float32',always_2d=True);score=np.zeros((N,2),np.float32)
# 150 BPM, 16 beats per phrase. Preserve original speed; overlap four-bar phrases.
loop_start=25.6;loop_end=204.8;overlap=6.4;first_end=int((loop_end-overlap)*sr);score[:min(N,first_end)]=music[:min(N,first_end)]
pos=first_end
while pos<N:
 length=min(int((loop_end-loop_start-overlap)*sr),N-pos);off=int(loop_start*sr);score[pos:pos+length]=music[off:off+length]
 fade=min(int(overlap*sr),length);u=np.linspace(0,1,fade,dtype=np.float32);u=u*u*(3-2*u)
 tail=music[int((loop_end-overlap)*sr):int(loop_end*sr)][:fade]
 score[pos:pos+fade]=tail*(1-u[:,None])+score[pos:pos+fade]*u[:,None];pos+=length
# Narration schedule controls a smooth look-ahead envelope; short gaps stay down.
control_sr=100;L=math.ceil(N/sr*control_sr);gain=np.ones(L,np.float32)
for c in tl['clips']:
 a=max(0,int((c['start']/30-.12)*control_sr));b=min(L,int((c['end']/30+.24)*control_sr));gain[a:b]=.46
for i in range(1,L):gain[i]=min(gain[i],gain[i-1]+1/(1.0*control_sr))
for i in range(L-2,-1,-1):gain[i]=min(gain[i],gain[i+1]+1/(.15*control_sr))
envelope=np.interp(np.arange(N)/sr,np.arange(L)/control_sr,gain).astype(np.float32)
# Keep the dense density/penalty explanation slightly quieter.
for scene in tl['scenes']:
 if scene['id'] in ['density','penalty']:
  a=scene['start']*1600;b=scene['end']*1600;n=b-a;v=np.minimum(np.arange(n)/(sr*1.5),1)*np.minimum(np.arange(n)[::-1]/(sr*1.5),1);envelope[a:b]*=1-.14*v
score*=envelope[:,None];narr,_=sf.read(P/'narration.wav',dtype='float32',always_2d=True)
active=np.zeros(N,bool)
for c in tl['clips']:active[c['start']*1600:c['end']*1600]=True
rms=lambda w:20*np.log10(max(float(np.sqrt(np.mean(w*w))),1e-9))
relative=rms(narr[active])-rms(score[active]);scoreGain=10**((relative-17)/20);score*=scoreGain
t=np.arange(N)/sr;score*=np.minimum(1,t/2)[:,None]*np.minimum(1,(t[-1]-t)/3)[:,None]
sf.write(P/'score.wav',score,sr,subtype='PCM_24');pre=R/'tmp/premaster-v3.wav';sf.write(pre,narr+score,sr,subtype='FLOAT')
measured=loud(pre,-15);normal=f'loudnorm=I=-15:TP=-1.8:LRA=9:measured_I={measured["input_i"]}:measured_TP={measured["input_tp"]}:measured_LRA={measured["input_lra"]}:measured_thresh={measured["input_thresh"]}:offset={measured["target_offset"]}:linear=true'
ff(['-v','error','-y','-i',str(pre),'-af',normal,'-ar',str(sr),'-ac','2','-c:a','pcm_s24le',str(P/'master.wav')])
after=loud(P/'master.wav');(Q/'mix.json').write_text(json.dumps({'track':'Cipher / Kevin MacLeod','tempo':150,'loopSeconds':[loop_start,loop_end],'overlapSeconds':overlap,'musicEQ':eq,'narrationAboveMusicActiveRmsDb':rms(narr[active])-rms(score[active]),'master':after,'subjectiveListeningChecked':False},indent=2),encoding='utf8')
print('Mixed',N/sr,'seconds',after['input_i'],'LUFS',flush=True)
