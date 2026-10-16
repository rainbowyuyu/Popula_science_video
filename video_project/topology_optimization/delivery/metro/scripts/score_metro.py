"""Original evolving city groove, narration ducking and measured two-pass mix.

All notes and percussion are synthesized here; no recorded third-party samples,
and no music stem from an earlier film is used.
"""
from pathlib import Path
import json,hashlib,subprocess
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfilt,lfilter

R=Path(__file__).resolve().parents[1]; P=R/'public/metro'; Q=R/'research/metro'
voice,sr=sf.read(P/'narration.wav',dtype='float32',always_2d=True)
N=len(voice); duration=N/sr; bpm=98; beat=60/bpm; bar=4*beat
rng=np.random.default_rng(20261004)
music=np.zeros((N,2),np.float32)
freq=lambda midi:440*2**((midi-69)/12)
def add(w,start,gain=1,pan=.5):
    k=round(start*sr)
    if k<0 or k>=N:return
    ln=min(len(w),N-k)
    music[k:k+ln,0]+=w[:ln]*(gain*np.sqrt(1-pan))
    music[k:k+ln,1]+=w[:ln]*(gain*np.sqrt(pan))
def epiano(midi,seconds=3.2,velocity=.7):
    t=np.arange(round(seconds*sr),dtype=np.float32)/sr; f=freq(midi)
    # A short felt/hammer transient, gently inharmonic tine and decaying body.
    attack=(1-np.exp(-t/.009)); env=attack*np.exp(-t/(1.65+.35*velocity))
    body=np.sin(2*np.pi*f*t+.11*np.sin(2*np.pi*f*2*t)*np.exp(-t/.35))
    body+=.26*np.sin(2*np.pi*f*2.003*t)*np.exp(-t/.7)
    body+=.095*np.sin(2*np.pi*f*3.009*t)*np.exp(-t/.2)
    return np.asarray(body*env*.075*velocity,np.float32)
def bass(midi,seconds=.7):
    t=np.arange(round(seconds*sr),dtype=np.float32)/sr; f=freq(midi)
    env=(1-np.exp(-t/.014))*np.exp(-t/1.1)*np.minimum(1,(seconds-t)/.08)
    return np.asarray((np.sin(2*np.pi*f*t)+.15*np.sin(4*np.pi*f*t))*env*.10,np.float32)
def mallet(midi):
    t=np.arange(round(.9*sr),dtype=np.float32)/sr; f=freq(midi)
    env=(1-np.exp(-t/.005))*np.exp(-t/.28)
    return np.asarray((np.sin(2*np.pi*f*t)+.11*np.sin(2*np.pi*f*2.76*t))*env*.034,np.float32)
def kick():
    t=np.arange(round(.24*sr),dtype=np.float32)/sr
    phase=2*np.pi*(48*t+34*.025*(1-np.exp(-t/.025)))
    return np.asarray(np.sin(phase)*np.exp(-t/.06)*(1-np.exp(-t/.002))*.075,np.float32)
def tick(seconds=.055,brush=False):
    t=np.arange(round(seconds*sr),dtype=np.float32)/sr
    noise=rng.normal(0,1,len(t)).astype(np.float32)
    noise=sosfilt(butter(2,[900,5200 if brush else 7400],fs=sr,btype='band',output='sos'),noise)
    env=np.exp(-t/(.04 if brush else .013))*(1-np.exp(-t/.0015))
    return np.asarray(noise*env*(.029 if brush else .017),np.float32)

# Warm close-position Dmaj9 / Bm9 / Gmaj9 / Asus4-A13 voicings, then a
# middle-eight with Em9 / F#m7 / Gmaj9 / A13. Root order and top voices evolve.
progressions=[
    [(38,[57,61,64,66]),(35,[57,61,62,66]),(31,[54,57,59,62]),(33,[55,59,61,64])],
    [(40,[55,59,62,66]),(42,[57,61,64,68]),(31,[54,59,62,66]),(33,[55,59,61,66])],
    [(38,[54,57,61,64]),(35,[54,57,61,66]),(31,[54,57,62,66]),(33,[55,59,61,64])]
]
melodies=[[66,64,61,64,69,66,64,61],[66,69,73,71,69,66,64,61],
          [64,66,69,66,62,61,59,61],[66,64,61,57,59,61,64,66]]
bars=int(np.ceil(duration/bar))
for i in range(bars):
    t0=i*bar+.06; phrase=i//8; section=(i//24)%3
    if t0>duration-7:continue
    root,chord=progressions[section][(i//2)%4]
    energy=.72 if i<4 else (1.0 if section!=1 else .84)
    if t0>duration-10:energy*=.75
    # Sparse syncopated comping, with four-bar breathing spaces.
    hits=[(0,.73),(2.5,.48)] if i%4!=3 else [(0,.72)]
    for at,vel in hits:
        for j,n in enumerate(chord):add(epiano(n,velocity=vel),t0+at*beat+j*.011,energy,.25+j*.15)
    if i>=2:
        add(bass(root,1.0*beat),t0,energy,.5)
        add(bass(root+12,.62*beat),t0+1.5*beat,energy*.65,.5)
        add(bass(root+7,.7*beat),t0+2.75*beat,energy*.75,.5)
        if i%4==3:add(bass(root+11,.35*beat),t0+3.55*beat,energy*.38,.5)
    if i>=4 and i<bars-3:
        add(kick(),t0,energy*.75,.5); add(kick(),t0+2.5*beat,energy*.55,.5)
        add(tick(.11,True),t0+beat,energy,.44);add(tick(.11,True),t0+3*beat,energy*.86,.57)
        for j in range(8):
            if i%8==7 and j>4:continue
            add(tick(),t0+(j*.5+(.027 if j%2 else 0))*beat,energy*(.5 if j%2==0 else .8),.62 if j%2 else .35)
    # Motifs occur once per four bars, so they punctuate reasoning rather than
    # repeat an exposed beep on every beat. Upper register is deliberately low.
    if i%4 in (0,2) and i>5 and i<bars-4:
        melody=melodies[phrase%4]; offset=0 if i%4==0 else 4
        for j,at in enumerate([.5,1.25,2.5,3.25]):
            add(mallet(melody[offset+j]),t0+at*beat,energy*.68,.28+.14*j)
    if i%16==15:
        for j in range(3):add(tick(.09,True),t0+(3+j*.25)*beat,.3,.35+.15*j)

# A deliberate tonic resolution supports the eight-second source coda.
for j,n in enumerate([50,57,61,64,66]):
    add(epiano(n,seconds=6.6,velocity=.56),duration-6.8+j*.02,.9,.22+.14*j)
add(bass(38,seconds=2.8),duration-6.8,.62,.5)

# Small room reflections, never a long cinematic wash over the narration.
for delay,gain in [(.071,.08),(.113,.06),(.181,.04)]:
    d=round(delay*sr);music[d:]+=music[:-d,::-1]*gain
music=sosfilt(butter(2,8500,fs=sr,btype='lowpass',output='sos'),music,axis=0).astype(np.float32)
# Give consonants room: broad, gentle 2.5 kHz dip in the music alone.
notch=sosfilt(butter(1,[1700,3700],fs=sr,btype='band',output='sos'),music,axis=0).astype(np.float32)
music-=notch*.36
timeline=json.loads((P/'timeline.json').read_text('utf8'))
block=480; envelope=np.zeros(int(np.ceil(N/block)),np.float32)
for clip in timeline['clips']:
    a=max(0,int((clip['start']/30-.11)*sr/block)); b=min(len(envelope),int((clip['end']/30+.20)*sr/block))
    envelope[a:b]=1
# Fast attack, one-second release; stays down across the tiny sentence gaps.
duck=np.zeros_like(envelope); level=0
for i,wanted in enumerate(envelope):
    coeff=.25 if wanted>level else .01
    level+=coeff*(wanted-level);duck[i]=level
active=np.max(np.abs(voice),axis=1)>.012
vr=np.sqrt(np.mean(voice[active]**2));mr=np.sqrt(np.mean(music[active]**2))
music*=vr/(max(mr,1e-9)*10**(17.5/20))
music*=np.repeat(1-.22*duck,block)[:N,None]
secs=np.arange(N)/sr
coda_start=next(s for s in timeline['scenes'] if s['id']=='references')['start']/30
music*=(1+.45*np.clip((secs-coda_start)/1.3,0,1))[:,None]
fade=np.clip(secs/1.2,0,1)*np.clip((duration-secs)/3.5,0,1)
music*=fade[:,None]
sf.write(P/'music.wav',music,sr,subtype='PCM_24')
sf.write(P/'premaster.wav',voice+music,sr,subtype='PCM_24')
def loudness(path):
    proc=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    return json.JSONDecoder().raw_decode(proc.stderr[proc.stderr.rfind('{'):])[0]
measurement=loudness(P/'premaster.wav')
flt='loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:'+':'.join(f'{k}={measurement[v]}' for k,v in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
subprocess.run(['ffmpeg','-y','-v','error','-i',str(P/'premaster.wav'),'-af',flt,'-ar',str(sr),'-c:a','pcm_s24le',str(P/'master.wav')],check=True)
master,s=sf.read(P/'master.wav',dtype='float32',always_2d=True)
assert s==sr and len(master)==N and np.isfinite(master).all()
final=loudness(P/'master.wav')
(P/'previews').mkdir(exist_ok=True)
sf.write(P/'previews/music-city-groove.wav',music[round(10*sr):round(34*sr)]*3,sr,subtype='PCM_16')
sf.write(P/'previews/mix-opening.wav',master[:round(30*sr)],sr,subtype='PCM_16')
side=next(s for s in timeline['scenes'] if s['id']=='side')['start']/30
sf.write(P/'previews/mix-principle.wav',master[round(side*sr):round((side+24)*sr)],sr,subtype='PCM_16')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
history=json.loads(Path('C:/Users/zju/.codex/skills/rainbow-science-short/references/music-history.json').read_text('utf-8-sig'))
musicsha=sha(P/'music.wav')
assert musicsha not in [r.get('sha256') for r in history['records']]
manifest={'title':'下一站·留白','composer':'rainbow鱼 original procedural composition',
    'source':'scripts/score_metro.py; seed 20261004','license':'Original synthesized score; no third-party samples',
    'tempoBpm':bpm,'instrumentation':['felt electric piano','soft mallets','rounded bass','brushed syncopated percussion'],
    'musicReused':False,'musicHistoryCompared':True,'singleBedMix':True,
    'durationSeconds':duration,'targetLufs':-16,'targetTruePeak':-1.5,
    'premasterMeasurement':measurement,'masterMeasurement':final,
    'voiceToMusicActiveRmsDb':float(20*np.log10(vr/np.sqrt(np.mean(music[active]**2)))),
    'ducking':{'lookaheadSeconds':.11,'holdSeconds':.2,'releaseSeconds':1.0},
    'files':{name:{'sha256':sha(P/name),'bytes':(P/name).stat().st_size} for name in ['narration.wav','music.wav','master.wav']},
    'subjectiveListeningChecked':False,'aacMeasurementPending':True}
(Q/'audio-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
