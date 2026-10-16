"""江风里的光 / Riverlight — a new score, not a re-timing of an old master.

Reuses only CC0 one-note instrument samples through the existing sampler.
Melody, chords, rhythm, orchestration, and all event timing are new for V16.
"""
from pathlib import Path
import json,sys,hashlib
import numpy as np
from scipy.signal import butter,sosfilt,oaconvolve
import soundfile as sf
ROOT=Path(__file__).resolve().parents[3];WORK=ROOT/'work/v16/audio'
sys.path.insert(0,str(ROOT/'audio'))
from acoustic_bank import AcousticBank
SR=48000;SEED=2026101116;TITLE='江风里的光 / Riverlight'
CHORDS=[(38,[54,57,61,64,69]),(47,[54,57,61,66,69]),
        (43,[55,59,62,66,69]),(45,[57,59,64,66,71]),
        (42,[54,57,61,64,68]),(47,[54,57,62,66,69]),
        (43,[55,59,62,66,69]),(45,[57,61,64,66,69])]
# An arching pentatonic top line, followed by descending answers and space.
MELODY=[[(.15,78,1.65),(2.20,81,1.35)],[(.40,85,2.7)],
        [(.10,83,1.5),(2.45,81,1.15)],[(.30,78,2.7)],
        [(.18,76,1.6),(2.18,78,1.3)],[(.48,81,2.5)],
        [(.14,78,1.5),(2.65,76,.95)],[(.25,74,3.1)]]
def ss(x):x=np.clip(x,0,1);return x*x*(3-2*x)
def compose(seconds,vertical=False):
    n=round(seconds*SR);rng=np.random.default_rng(SEED+(1 if vertical else 0));bank=AcousticBank(SR)
    dry=np.zeros((n,2),np.float32);room=np.zeros_like(dry);events=[]
    def add(inst,note,at,dur,vel,pan=0,send=.14,variation=0):
        if at>=seconds or at+dur<=0 or vel<.002:return
        w=bank.note(inst,note,dur,vel,variation);mid=w.mean(axis=1);side=(w[:,0]-w[:,1])*.18
        angle=(pan+1)*np.pi/4;st=np.stack([mid*np.cos(angle)*1.414+side,mid*np.sin(angle)*1.414-side],axis=1)
        start=round(at*SR);skip=max(0,-start);start=max(0,start);count=min(len(w)-skip,n-start)
        if count<1:return
        dry[start:start+count]+=st[skip:skip+count];room[start:start+count]+=st[skip:skip+count]*send
        events.append(dict(instrument=inst,midi=int(note),at=round(at,5),seconds=round(dur,5),velocity=round(vel,5),pan=pan))
    t=.12;bar=0
    while t<seconds-7.2:
        p=t/seconds;phase=bar%8;phrase=bar//8
        building=float(ss((p-.12)/.18));wind=float(ss((p-.55)/.12)*(1-ss((p-.80)/.10)))
        calm=1-float(ss((p-.87)/.08));intro=1-float(ss(p/.09))
        bpm=100+6*wind-5*(1-calm);beat=60/bpm;length=4*beat
        root,ch=CHORDS[phase];energy=(.55+.22*building+.18*wind)*(.82+.18*calm)
        jit=lambda:float(rng.uniform(-.007,.007))
        # Left-hand ninths leave room for narration fundamentals.
        add('piano',root+12,t+jit(),length+1.0,.23*energy,-.20,.13,bar)
        add('piano',ch[1],t+.045,length+.9,.11*energy,-.16,.17,bar+1)
        # 3+3+2 harp figure suggests reflections without a mechanical tick.
        for k,(off,ix) in enumerate([(0.45,0),(1.2,2),(1.95,3),(2.7,2),(3.2,4)]):
            if intro>.3 and k not in (0,3):continue
            add('harp',ch[ix]+12,t+off*beat+jit(),1.6,.105*energy*(1+.25*wind),-.34+.15*k,.18,bar+k)
        # Melody answers itself every two bars, with breathing space between.
        if phrase%3!=1 or phase%2==0:
            for k,(off,note,held) in enumerate(MELODY[phase]):
                octave=-12 if phrase%4==2 else 0
                add('piano',note+octave,t+off*beat+jit(),held*beat+1.1,.205*energy,.12,.19,bar+k)
        flow=float(ss((p-.035)/.09))*calm
        for k,off in enumerate([.02,1.5,2.5]):
            add('pizz',root+12+(7 if k==1 else 0),t+off*beat+jit(),.95,.15*energy*flow,-.09+k*.09,.08,bar+k)
        if phase%2==1 and building>.3:
            for k,off in enumerate([1.0,3.0]):add('tap',60,t+off*beat,.20,.07*energy*flow,-.16+k*.24,.05,bar+k)
        if bar%2==0 and p>.12:
            add('cello',root+12,t-.06,length*2+.2,.075*energy,-.27,.22,bar)
            if wind>.4:add('viola',ch[3],t+.09,length*2,.045*energy,.29,.24,bar+1)
        t+=length;bar+=1
    cadence=seconds-7.1
    for k,note in enumerate([50,57,61,66,69,74,78]):
        add('piano',note,cadence+k*.11,6.5,.105 if k<4 else .145,-.16+.05*k,.20,k)
    for k,note in enumerate([74,78,81,86]):add('harp',note,cadence+.75+k*.23,4.2,.07,.22,.24,k)
    # Short room plus discrete reflection taps. No wideband ambience is added
    # to the speech stem and no external recordings are sampled.
    irn=round(1.2*SR);tt=np.arange(irn)/SR
    ir=rng.normal(0,1,(irn,2)).astype(np.float32)*np.exp(-tt[:,None]/.25)
    ir[:round(.028*SR)]=0
    ir=sosfilt(butter(2,3800,fs=SR,output='sos'),ir,axis=0).astype(np.float32)
    ir/=max(1e-9,float(np.sqrt(np.sum(ir**2,axis=0)).max()));ir*=.16
    for delay,gain in [(.042,.09),(.078,.045),(.116,.02)]:
        ir[round(delay*SR),0]+=gain;ir[round((delay+.012)*SR),1]+=gain*.85
    out=dry.copy()
    for c in range(2):out[:,c]+=oaconvolve(room[:,c],ir[:,c],mode='full')[:n]
    out=sosfilt(butter(2,42,fs=SR,btype='highpass',output='sos'),out,axis=0).astype(np.float32)
    presence=sosfilt(butter(2,[1900,4300],fs=SR,btype='bandpass',output='sos'),out,axis=0).astype(np.float32)
    out-=presence*.30
    t=np.arange(n,dtype=np.float32)/SR
    out*=ss(t/.8)[:,None]*(1-ss((t-(seconds-4.1))/4.1))[:,None]
    out*=.65/max(1e-9,float(np.max(np.abs(out))))
    prefix='vertical-' if vertical else '';dest=WORK/(prefix+'score-original.wav')
    sf.write(dest,out,SR,subtype='PCM_24')
    metadata=dict(title=TITLE,seed=SEED+(1 if vertical else 0),durationSeconds=seconds,baseTempoBPM=100,
        tempoRangeBPM=[95,106],meter='4/4',tonality='D major / B minor with added ninths',
        composition='New melody, chord voicings, rhythm and arrangement created for Shanghai Tower V16',
        reusedPreviousComposition=False,reusedPreviousMaster=False,
        sampleLicense='CC0-1.0',sampleSource='https://github.com/sgossner/VSCO-2-CE',
        sampleManifest='audio/music_source/samples/manifest.json',licenseFile='audio/music_source/samples/LICENSE',
        sampleManifestSHA256=hashlib.sha256((ROOT/'audio/music_source/samples/manifest.json').read_bytes()).hexdigest(),
        waveformSHA256=hashlib.sha256(dest.read_bytes()).hexdigest(),eventCount=len(events),events=events,
        subjectiveListeningChecked=False)
    (WORK/(prefix+'music-composition.json')).write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(prefix+'score',seconds,'seconds',len(events),'notes',flush=True)
if __name__=='__main__':
    compose(360,False);compose(90,True)
