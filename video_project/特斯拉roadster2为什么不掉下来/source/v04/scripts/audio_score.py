"""Original, seeded 104 BPM instrumental score. No sampled copyrighted music.

Warm electric-piano voicings, slowly moving analog pads, a restrained rhythm
section and a short developing motif. Scene boundaries shape orchestration;
the beat grid itself remains continuous so explanations don't sound spliced.
"""
from pathlib import Path
import argparse, json, math, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly
from audio_common import ROOT, OUT, SR, save, sha, measure

S=24000
BPM=104
BEAT=60/BPM
BAR=4*BEAT
SEED=20261016

def frequency(note):return 440*2**((note-69)/12)

def edge(n,attack=.015,release=.12):
    e=np.ones(n,dtype=np.float32);a=min(n,round(attack*S));r=min(n,round(release*S))
    if a:e[:a]*=np.sin(np.linspace(0,np.pi/2,a))**2
    if r:e[-r:]*=np.cos(np.linspace(0,np.pi/2,r))**2
    return e

def piano(note,duration=3.5,velocity=.55):
    t=np.arange(round(duration*S),dtype=np.float32)/S;f=frequency(note)
    # Mild tine FM attacks decay into a rounded fundamental, with unequal partials.
    phase=2*np.pi*f*t+.72*np.exp(-t*4)*np.sin(2*np.pi*f*2.003*t)
    y=(np.sin(phase)*np.exp(-t/.95)+.24*np.sin(2*np.pi*f*2.004*t)*np.exp(-t/.42)
       +.075*np.sin(2*np.pi*f*3.997*t)*np.exp(-t/.19))
    return y*edge(len(t),.004,.35)*velocity

def pad(note,duration=5.4):
    t=np.arange(round(duration*S),dtype=np.float32)/S;f=frequency(note);y=np.zeros(len(t),np.float32)
    for detune,phase in [(-.004,.3),(0,1.2),(.003,2.1)]:
        for h,level in [(1,.26),(2,.07),(3,.025)]:y+=level*np.sin(2*np.pi*f*(1+detune)*h*t+phase)
    y*=.93+.07*np.sin(2*np.pi*.18*t)
    return y*edge(len(t),.8,1.1)

def bass(note,duration):
    t=np.arange(round(duration*S),dtype=np.float32)/S;f=frequency(note)
    y=np.sin(2*np.pi*f*t)+.17*np.sin(4*np.pi*f*t)*np.exp(-t*4)
    return y*np.exp(-t*.8)*edge(len(t),.012,.09)

def kick(rng):
    t=np.arange(round(.43*S))/S;phase=2*np.pi*(43*t+(115-43)*.022*(1-np.exp(-t/.022)))
    return (np.sin(phase)*np.exp(-t*13)+.09*rng.normal(size=len(t))*np.exp(-t*120))*edge(len(t),.001,.06)

def brush(rng,duration=.17):
    t=np.arange(round(duration*S))/S;n=rng.normal(size=len(t)).astype(np.float32)
    n=sosfilt(butter(2,[1300,7000],btype='bandpass',fs=S,output='sos'),n)
    return n*np.exp(-t*24)*edge(len(t),.003,.035)

def hat(rng,opened=False):
    duration=.19 if opened else .055;t=np.arange(round(duration*S))/S
    n=sosfilt(butter(2,6500,btype='highpass',fs=S,output='sos'),rng.normal(size=len(t)))
    return n*np.exp(-t*(22 if opened else 80))*edge(len(t),.002,.015)

def score(duration,narr=None):
    rng=np.random.default_rng(SEED);n=round(duration*S);audio=np.zeros((n,2),np.float32)
    events=[]
    def add(y,start,amp=1,pan=0,kind='',note=None):
        i=round(start*S)
        if i>=n or i<0:return
        y=y[:n-i].astype(np.float32)*amp
        audio[i:i+len(y),0]+=y*math.sqrt((1-pan)/2)
        audio[i:i+len(y),1]+=y*math.sqrt((1+pan)/2)
        if kind:events.append({'time':round(start,5),'instrument':kind,'note':note})
    groups=(narr or {}).get('groups',[])
    coda=(narr or {}).get('coda',{}).get('startSec',duration-8)
    def phase_at(t):
        if t>=coda:return 'coda'
        for g in groups:
            if g['startSec']<=t<=g['endSec']:return g['id']
        return 'hook' if t<18 else 'body'
    # D minor with open ninths. The A dominant gently resolves each 16-bar arc.
    chords=[([50,57,60,64,69],38,'Dm9'),([46,53,57,62,65],34,'Bbmaj7'),
            ([48,53,57,60,67],41,'Fadd9'),([48,55,57,62,64],36,'C6add9'),
            ([50,55,58,62,69],31,'Gm9'),([46,53,57,62,65],34,'Bbmaj7'),
            ([45,52,57,62,64],33,'Asus4'),([45,52,55,61,64],33,'A7')]
    harmony=[]
    for bar in range(math.ceil(duration/BAR)):
        t=bar*BAR;phrase=bar//16;chord,root,name=chords[(bar//2)%len(chords)];phase=phase_at(t)
        if phase=='coda':continue
        energy={'hook':.8,'suction':.46,'ceiling':.48,'release':.52,'thrust':.68,'roll':.8,'control':.58,'limits':.38,'recap':.73,'coda':.2}.get(phase,.52)
        if bar%2==0:
            harmony.append({'time':round(t,4),'bar':bar+1,'chord':name,'section':phase})
            for k,note in enumerate(chord):
                add(pad(note,2*BAR+1.1),t,.13,(-.65+k*.3),'pad',note)
                add(piano(note,3.8,.55),t+k*.019,.21,(-.45+k*.2),'electric-piano',note)
        # Syncopated motif appears between explanations, never a perpetual beep.
        if bar%4 in (1,3) and phase not in ('limits','coda'):
            offsets=[.5,1.5,2.75] if phrase%2==0 else [.75,2,3.25]
            notes=[chord[-1],chord[-2]+12,chord[-3]+12] if bar%4==1 else [chord[-2]+12,chord[-1]+12,chord[-1]]
            for k,(off,note) in enumerate(zip(offsets,notes)):
                add(piano(note,2.1,.35),t+off*BEAT,.18*energy,(-.3,.35,-.1)[k],'motif',note)
        if phase!='coda':
            for off,level in [(0,.42),(2.5,.23)]:add(bass(root,1.7*BEAT),t+off*BEAT,level*energy,0,'bass',root)
            for beat in (0,2):add(kick(rng),t+beat*BEAT,.35*energy,0,'kick')
            for beat in (1,3):add(brush(rng),t+beat*BEAT,.19*energy,-.16,'brush')
            for k in range(8):
                # Alternating velocities and a tiny fixed swing prevent a machine-gun texture.
                off=k*.5*BEAT+(.013 if k%2 else 0);v=.12 if k%2 else .065
                add(hat(rng,opened=k==7 and bar%4==3),t+off,v*energy,.33,'shaker')
        if bar%8==7 and phase not in ('coda','limits'):
            # Quiet brushed pickup into the next harmonic phrase.
            for k,v in enumerate([.05,.06,.075,.09]):add(brush(rng,.1),t+(3.25+k*.1875)*BEAT,v*energy,-.25+k*.14,'pickup')
    # A tonal handoff anticipates two major explanatory transitions; it does
    # not restart the clock or make every subtitle into a sound effect.
    for g in groups:
        if g['id'] in ('release','roll'):
            at=max(0,g['startSec']-.8)
            for k,note in enumerate((62,69,74)):
                y=piano(note,1.0,.22)[::-1].copy()*edge(S,.22,.07)
                add(y,at+k*.06,.12,(-.4,0,.4)[k],'transition-swell',note)
    # End on a deliberately voiced tonic rather than stopping the middle of
    # whichever loop happened to be playing when narration finished.
    for k,note in enumerate((50,57,60,64,69)):
        add(pad(note,max(1,duration-coda-.4)),coda+.15,.11,-.5+k*.25,'coda-pad',note)
        add(piano(note,max(1,duration-coda-.4),.45),coda+.25+k*.025,.20,-.4+k*.2,'coda-tonic',note)
    # Stereo room reflections and tempo-related diffusion; no abrupt score loop joins.
    dry=audio.copy()
    for delay,gain,swap in [(BEAT*.75,.12,True),(BEAT*1.5,.075,False),(.043,.09,True),(.071,.065,False),(.113,.04,True)]:
        shift=round(delay*S)
        if shift<n:audio[shift:]+=dry[:-shift,::-1] * gain if swap else dry[:-shift]*gain
    audio=sosfilt(butter(2,7800,btype='lowpass',fs=S,output='sos'),audio,axis=0).astype(np.float32)
    audio=np.tanh(audio*.88)/.88
    fadein=min(n,round(.35*S));fadeout=min(n,round(3.2*S));audio[:fadein]*=np.linspace(0,1,fadein)[:,None];audio[-fadeout:]*=(np.cos(np.linspace(0,np.pi/2,fadeout))**2)[:,None]
    audio=resample_poly(audio,2,1,axis=0).astype(np.float32)
    return audio[:round(duration*SR)],harmony,events

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--duration',type=float);a=ap.parse_args()
    p=OUT/'narration.json';narr=json.loads(p.read_text(encoding='utf8')) if p.exists() else None
    duration=a.duration or (narr['durationSec'] if narr else 300)
    destination=ROOT/'public/audio';destination.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    audio,harmony,events=score(duration,narr)
    raw=OUT/'score-composed.wav';sf.write(raw,audio,SR,subtype='PCM_24')
    # A broad presence dip gives consonants room while preserving warm harmonics.
    target=destination/'score.wav'
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(raw),'-af',
        'highpass=f=32,equalizer=f=2600:t=q:w=0.75:g=-4,loudnorm=I=-24:TP=-3:LRA=8',
        '-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(target)],check=True)
    x,sr=sf.read(target,dtype='float32');expected=round(duration*SR)
    x=x[:expected] if len(x)>=expected else np.pad(x,((0,expected-len(x)),(0,0)))
    sf.write(target,x,sr,subtype='PCM_24')
    save(OUT/'score-ledger.json',{'title':'Pressure / Lift','composition':'Original procedural instrumental composed for this Roadster explanation','seed':SEED,'bpm':BPM,'meter':'4/4','key':'D minor','sampleRate':SR,'durationSec':duration,'instruments':['FM electric piano','detuned harmonic pad','rounded bass','synthesized kick','filtered-noise brush and shaker'],'copyright':'Newly synthesized original composition; no third-party samples or copied melody','loopedSource':False,'sourceScript':Path(__file__).relative_to(ROOT).as_posix(),'scriptSha256':sha(__file__),'sha256':sha(target),'loudness':measure(target),'harmony':harmony,'events':events,'subjectiveListeningChecked':False})
    print(json.dumps({'score':str(target),'duration':duration,'events':len(events)},ensure_ascii=False))

if __name__=='__main__':main()
