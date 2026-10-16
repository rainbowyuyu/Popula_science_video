"""Same-episode V07 camera sound polish; keeps original music and voice intact.

Reads V06-derived premaster only. Adds sparse low-level designed air movement
and two softened CC0 harp grains. No TTS, no new composition, no source writes.
"""
from pathlib import Path
from fractions import Fraction
import hashlib,json,re,subprocess,sys
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfilt,resample_poly

ROOT=Path(__file__).resolve().parents[1]
SR=48000
SEED=2026101177
REPORT=ROOT/'research/audio'
AUDIO=ROOT/'public/audio'
sys.stdout.reconfigure(encoding='utf8')

def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for block in iter(lambda:f.read(1048576),b''):h.update(block)
    return h.hexdigest()

def write_json(name,data):
    (REPORT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')

def smooth(x):
    x=np.clip(x,0,1)
    return x*x*(3-2*x)

def normalize_local(x,rms_db):
    rms=float(np.sqrt(np.mean(x.astype(np.float64)**2)))
    return x*(10**(rms_db/20)/max(1e-8,rms))

def run_ffmpeg(args):
    return subprocess.run(['ffmpeg','-hide_banner',*args],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)

def measure(p):
    result=run_ffmpeg(['-i',str(p),'-af','loudnorm=I=-16:TP=-2.1:LRA=7:print_format=json','-f','null','-'])
    return json.loads(re.findall(r'\{\s*"input_i".*?\}',result.stderr,re.S)[-1]),result.stderr

def harp_grain(p,seconds,rms_db):
    x,sr=sf.read(p,dtype='float32',always_2d=True)
    if x.shape[1]==1:x=np.repeat(x,2,axis=1)
    if sr!=SR:
        ratio=Fraction(SR,sr)
        x=resample_poly(x,ratio.numerator,ratio.denominator,axis=0).astype(np.float32)
    # Trim only recording preroll, not a narration or musical phrase.
    block=240;pad=(-len(x))%block
    energy=np.sqrt(np.mean(np.pad(x,((0,pad),(0,0))).reshape(-1,block,2)**2,axis=(1,2)))
    hits=np.flatnonzero(energy>max(1e-6,float(energy.max())*.035))
    if len(hits):x=x[max(0,int(hits[0]*block)-384):]
    n=round(seconds*SR);out=np.zeros((n,2),np.float32);out[:min(n,len(x))]=x[:min(n,len(x))]
    out=sosfilt(butter(2,[550,3700],btype='bandpass',fs=SR,output='sos'),out,axis=0).astype(np.float32)
    t=np.arange(n,dtype=np.float32)/SR
    env=smooth(t/.035)*smooth((seconds-t)/.42)*np.exp(-t*2.0)
    return normalize_local(out*env[:,None],rms_db).astype(np.float32)

def main():
    REPORT.mkdir(parents=True,exist_ok=True)
    tl=json.loads((ROOT/'src/timeline.json').read_text('utf8'))
    n=round(tl['duration']/tl['fps']*SR);duration=n/SR
    sources=[AUDIO/name for name in ['premaster.wav','master.wav','narration.wav','score.wav','bed.wav']]
    before={p.name:sha(p) for p in sources}
    source,sr=sf.read(AUDIO/'premaster.wav',dtype='float32',always_2d=True)
    assert sr==SR and source.shape==(n,2),(sr,source.shape,n)
    fx=np.zeros_like(source);rng=np.random.default_rng(SEED)
    clips={c['id']:c for c in tl['clips']};scenes={s['id']:s for s in tl['scenes']}
    events=[]

    def add(x,at,kind,why,pan0=-.3,pan1=.3):
        start=round(at*SR);count=min(len(x),n-start)
        if count<=0:return
        if x.ndim==1:x=np.repeat(x[:,None],2,axis=1)
        p=np.linspace(pan0,pan1,count,dtype=np.float32)
        a=(p+1)*np.pi/4
        mono=x[:count].mean(axis=1);side=(x[:count,0]-x[:count,1])*.18
        stereo=np.stack((mono*np.cos(a)*1.414+side,mono*np.sin(a)*1.414-side),axis=1)
        fx[start:start+count]+=stereo
        events.append({'kind':kind,'atSeconds':round(at,6),'durationSeconds':count/SR,'purpose':why,'localRmsDbfs':round(20*np.log10(max(1e-9,float(np.sqrt(np.mean(stereo.astype(np.float64)**2))))),3),'peakDbfs':round(20*np.log10(max(1e-9,float(np.abs(stereo).max()))),3),'pan':[pan0,pan1]})

    # Sparse one-shot air movements, timed to narrative camera handoffs.
    motions=[
        (scenes['drop']['start']-.46,1.18,-53.0,'rain mist gathers into the hero drop',-.45,.3),
        (clips['r019']['start']+1.05,1.6,-53.5,'pull back from ray to the eye and anti-solar axis',.3,-.28),
        (clips['r027']['start']+.70,1.35,-54.0,'camera lifts above the horizon',-.1,.25),
        (clips['r034']['start']+.20,1.18,-54.0,'return to the secondary rainbow drop',.32,-.24),
        (scenes['return']['start']-.28,1.36,-53.5,'move through fountain mist back to reality',-.35,.35),
    ]
    for at,seconds,level,why,p0,p1 in motions:
        count=round(seconds*SR);t=np.arange(count,dtype=np.float32)/SR
        x=rng.normal(0,1,(count,2)).astype(np.float32)
        x=sosfilt(butter(2,[280,1850],btype='bandpass',fs=SR,output='sos'),x,axis=0).astype(np.float32)
        env=np.sin(np.pi*np.clip(t/seconds,0,1))**2.6
        x=normalize_local(x*env[:,None],level).astype(np.float32)
        add(x,at,'designed airy camera movement',why,p0,p1)

    # Softened real instrument grains: consonant C/F, no synthetic bells.
    # A restored V07 archive carries the accepted samples at their original
    # relative path; the slim live checkout reads the retained V06 copy.
    sample_root=ROOT/'research/music/samples'
    if not sample_root.is_dir():
        sample_root=ROOT.parent/'rainbow_arc_2026_v06/research/music/samples'
    sample_c=sample_root/'Strings/Harp/KSHarp_C5_mf.wav'
    sample_f=sample_root/'Strings/Harp/KSHarp_F4_mf.wav'
    assert sample_c.is_file() and sample_f.is_file()
    add(harp_grain(sample_c,.86,-52.3),clips['r010']['start']+.26,'CC0 harp grain','colour paths gently separate',-.18,.18)
    add(harp_grain(sample_f,.78,-53.0),clips['r014']['start']+.26,'CC0 harp grain','outgoing ray completes its return',.15,-.1)
    # Effects are explicitly sparse. Preserve the original resolving chord,
    # which began at duration-6.4 seconds in score_mix_v06.py.
    assert all(e['atSeconds']+e['durationSeconds']<duration-6.4 for e in events)
    sf.write(AUDIO/'sfx-motion-v07.wav',fx,SR,subtype='PCM_24')
    source+=fx
    sf.write(AUDIO/'premaster-v07.wav',source,SR,subtype='PCM_24')
    first,log=measure(AUDIO/'premaster-v07.wav')
    write_json('v07-loudnorm-pass1.json',first)
    (REPORT/'v07-loudnorm-pass1.txt').write_text(log,'utf8')
    filt=(f'loudnorm=I=-16:TP=-2.1:LRA=7:measured_I={first["input_i"]}:measured_TP={first["input_tp"]}:'
          f'measured_LRA={first["input_lra"]}:measured_thresh={first["input_thresh"]}:offset={first["target_offset"]}:'
          f'linear=true:print_format=json,aresample={SR},apad=whole_len={n},atrim=end_sample={n}')
    result=run_ffmpeg(['-y','-i',str(AUDIO/'premaster-v07.wav'),'-af',filt,'-ar',str(SR),'-c:a','pcm_s24le',str(AUDIO/'master-v07.wav')])
    (REPORT/'v07-loudnorm-pass2.txt').write_text(result.stderr,'utf8')
    final_measure,log=measure(AUDIO/'master-v07.wav')
    write_json('v07-final-loudness.json',final_measure)
    (REPORT/'v07-final-loudness.txt').write_text(log,'utf8')
    info=sf.info(AUDIO/'master-v07.wav')
    assert info.samplerate==SR and info.frames==n and info.channels==2
    assert abs(float(final_measure['input_i'])+16)<.18,final_measure
    assert float(final_measure['input_tp'])<=-1.5,final_measure
    after={p.name:sha(p) for p in sources}
    assert before==after,'source audio files changed'
    activity=np.zeros(n,dtype=bool)
    for c in tl['clips']:activity[round(c['start']*SR):round(c['end']*SR)]=True
    voice,vsr=sf.read(AUDIO/'narration.wav',dtype='float32')
    voice=np.pad(voice,(0,max(0,n-len(voice))))[:n]
    voice_rms=float(np.sqrt(np.mean(voice[activity].astype(np.float64)**2)))
    effects_rms=float(np.sqrt(np.mean(fx[activity].astype(np.float64)**2)))
    report={'status':'pass','musicTitle':'雨后追光','change':'same episode sound-design refinement; original V06 composition, cadence and narration retained',
        'seed':SEED,'frames':tl['duration'],'fps':tl['fps'],'audioSamples':n,'sampleRate':SR,'durationSeconds':duration,
        'events':events,'voiceEffectsActiveRmsDifferenceDb':20*np.log10(voice_rms/max(1e-9,effects_rms)),
        'loudness':final_measure,'sourceHashesUnchanged':before,'outputs':{name:sha(AUDIO/name) for name in ['sfx-motion-v07.wav','premaster-v07.wav','master-v07.wav']},
        'sampleProvenance':[{'path':str(p),'sha256':sha(p),'license':'VSCO 2 Community Edition CC0-1.0','licensePath':str(sample_root/'LICENSE')} for p in [sample_c,sample_f]],
        'effectsProvenance':'Five short deterministic shaped-noise camera cues and two filtered real harp-note grains, not field recordings or a newly generated music track',
        'humanListeningChecked':False,'ttsRegenerated':False}
    write_json('v07-motion-mix-report.json',report)
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':main()
