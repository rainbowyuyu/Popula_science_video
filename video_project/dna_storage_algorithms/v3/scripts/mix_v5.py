"""Re-score the same-film Archive Glow theme to V5's natural story timing.

No arbitrary WAV looping and no speech stretching.  The original 84 BPM motif
and chord vocabulary are re-performed from the licensed CC0 sample bank for
the actual duration, with orchestration following chapter boundaries.
"""
import argparse, json, re, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from scipy.signal import butter, sosfilt
from acoustic_bank import AcousticBank
from score_v4 import PROGRESSION, MOTIF_ONSETS, MOTIF_NOTES
from audio_v5_common import ROOT, OUT, SR, sha, save

BPM=84
BEAT=60/BPM
SEED=202610115

def db(x):return float(20*np.log10(max(float(x),1e-12)))
def rms(x):return np.sqrt(np.mean(x*x,dtype=np.float64))
def measure(path):
    r=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af',
        'loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],
        capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    return json.loads(re.findall(r'\{[^{}]+\}',r.stderr,re.S)[-1])

def story_energy(narr,t):
    default={'hook':(.30,.07,.12),'encode':(.37,.15,.18),'constraints':(.40,.18,.20),
             'fountain':(.46,.28,.25),'wetlab':(.28,.12,.14),'consensus':(.40,.20,.20),
             'model':(.43,.23,.27),'return':(.36,.13,.26)}
    groups=narr['groups']
    centers=[(g['startSec']+g['endSec'])/2 for g in groups]
    values=[]
    for g in groups:
        level=default.get(g['id'],(.38,.17,.19))
        gain=float(np.clip(g.get('musicEnergy',1.0),.4,1.4))
        values.append(np.asarray(level)*gain)
    # Changes are interpolated across a musical phrase, not snapped at a cut.
    energy=np.array([np.interp(t,centers,[v[i] for v in values]) for i in range(3)])
    if t>=narr['coda']['startSec']:
        u=np.clip((t-narr['coda']['startSec'])/2.8,0,1)
        energy=energy*(1-u)+np.array([.20,.045,.10])*u
    return energy

def build_score(narr):
    duration=narr['durationSec'];n=round(duration*SR)
    score=np.zeros((n,2),np.float32);fx=np.zeros_like(score)
    rng=np.random.default_rng(SEED);bank=AcousticBank();events=[];fxevents=[]
    def note(inst,midi,at,seconds,velocity,pan=0):
        if at<0 or at>=duration:return
        x=bank.note(inst,int(midi),seconds,velocity,int(rng.integers(0,3)))
        x[:,0]*=np.sqrt((1-pan)/2)*1.4142;x[:,1]*=np.sqrt((1+pan)/2)*1.4142
        a=round(at*SR);b=min(n,a+len(x));score[a:b]+=x[:b-a]
        events.append({'instrument':inst,'midi':int(midi),'start':round(at,4),
                       'duration':round(seconds,4),'velocity':round(velocity,4),'pan':pan})
    bars=int(np.ceil(duration/(4*BEAT)))
    for bar in range(bars):
        at=bar*4*BEAT;phase=bar%len(PROGRESSION);root,chord=PROGRESSION[phase]
        pad,pulse,motif=story_energy(narr,at)
        # Close on an intentional Em–A–D cadence rather than fade mid-progression.
        if bar==bars-3:root,chord=40,[40,43,47,52];phase=6
        elif bar==bars-2:root,chord=45,[45,49,52,57];phase=5
        elif bar==bars-1:root,chord=38,[38,42,45,50];phase=4
        note('cello',root,at,3.72,.30*pad/.4,-.16)
        note('viola',chord[1]+12,at+.08,3.5,.12*pad/.4,.22)
        if bar%2==0:note('viola',chord[2]+12,at+.23,3.3,.10*pad/.4,.30)
        for k in range(4):
            midi=chord[[0,2,1,3][k]]+(12 if (bar+k)%3==0 else 0)
            note('piano',midi,at+k*BEAT,1.22,pulse*(.82 if k%2 else 1),-.18+.12*k)
        current=next((g['id'] for g in narr['groups'] if g['startSec']<=at<g['endSec']),'coda')
        if current in ('encode','constraints','fountain','wetlab','model','return'):
            for k in (1,2,3):
                note('harp',chord[(k+bar)%4]+12,at+k*.36,.95,.10+.025*motif/.25,.28)
        if current in ('fountain','consensus'):
            for k in (0,2,3):
                note('pizz',chord[(k+1)%4]+12,at+k*BEAT*.92,.62,.12*(.78 if k==2 else 1),.08 if k%2 else -.12)
        if bar%2==0 or current in ('hook','return','coda'):
            for onset,midi in zip(MOTIF_ONSETS,MOTIF_NOTES[phase]):
                note('piano',midi,at+onset*BEAT,.86,motif,-.04)
        if current in ('fountain','wetlab','consensus','model'):
            count=round(.42*SR);tt=np.arange(count,dtype=np.float32)/SR
            y=np.sin(2*np.pi*(55*2**((root-43)/12))*tt)
            y*=np.sin(np.pi*np.clip(tt/.42,0,1))**1.5*(.012+.004*pulse)
            a=round((at+.02)*SR);b=min(n,a+count)
            if b>a:score[a:b,0]+=y[:b-a]*.75;score[a:b,1]+=y[:b-a]
    for group in narr['groups'][1:]+[{'id':'coda','startSec':narr['coda']['startSec']}]:
        at=max(0,float(group['startSec'])-.58);count=round(1.15*SR)
        tt=np.arange(count,dtype=np.float32)/SR
        noise=sosfilt(butter(2,[320,2600],fs=SR,btype='bandpass',output='sos'),rng.normal(0,1,count))
        env=np.sin(np.pi*np.clip(tt/1.15,0,1))**2
        tone=np.sin(2*np.pi*(160*tt+96*tt*tt))*np.exp(-tt*2.7)
        y=(noise*.006+tone*.0022)*env;a=round(at*SR);b=min(n,a+count)
        if b>a:fx[a:b,0]+=y[:b-a]*.72;fx[a:b,1]+=y[:b-a]
        fxevents.append({'id':group['id'],'centerSec':group['startSec'],'startSec':at,'durationSec':1.15})
    fade=np.ones(n,np.float32);m=min(2*SR,n);fade[:m]=np.linspace(0,1,m)**.72
    m=min(4*SR,n);fade[-m:]=np.linspace(1,0,m)**1.35
    score*=fade[:,None];fx*=fade[:,None]
    score=sosfilt(butter(2,6800,fs=SR,output='sos'),score,axis=0).astype(np.float32)
    musicpath=OUT/'music-story.wav';fxpath=OUT/'transitions-story.wav'
    sf.write(musicpath,score,SR,subtype='PCM_24');sf.write(fxpath,fx,SR,subtype='PCM_24')
    original=ROOT/'research/music-composition-v4.json';source=ROOT/'public/music/dna_archive_glow_v4.wav'
    manifest={'title':'DNA档案微光 / DNA Archive Glow','arrangement':'V5 natural-story re-performance',
        'sameFilmReuse':True,'bpm':BPM,'meter':'4/4','seed':SEED,'durationSec':duration,
        'timeStretch':False,'arbitraryWavLooping':False,'sourceSampleLicense':'CC0-1.0',
        'sourceSamples':'https://github.com/sgossner/VSCO-2-CE','sampleManifest':'public/music/samples/manifest.json',
        'sourceComposition':{'path':original.relative_to(ROOT).as_posix(),'sha256':sha(original)},
        'originalThemeRecording':{'path':source.relative_to(ROOT).as_posix(),'sha256':sha(source)},
        'timelineSha256':sha(OUT/'narration.json'),'fxEvents':fxevents,'events':events,
        'subjectiveListeningChecked':False,
        'files':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)} for p in (musicpath,fxpath)]}
    save(OUT/'music-arrangement.json',manifest)
    return musicpath,fxpath

def main():
    p=argparse.ArgumentParser();p.add_argument('--reuse-score',action='store_true',help='Reuse only if saved timeline hash still matches')
    args=p.parse_args();narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    voice,sr=sf.read(OUT/'narration.wav',dtype='float32',always_2d=True)
    if sr!=SR or len(voice)!=round(narr['durationSec']*SR):raise RuntimeError('Narration format/timeline mismatch')
    musicpath=OUT/'music-story.wav';fxpath=OUT/'transitions-story.wav'
    if args.reuse_score:
        manifest=json.loads((OUT/'music-arrangement.json').read_text(encoding='utf8'))
        if manifest['timelineSha256']!=sha(OUT/'narration.json'):raise RuntimeError('Story changed; re-score is required')
        for row in manifest['files']:
            if sha(ROOT/row['path'])!=row['sha256']:raise RuntimeError('Score source was changed')
    else:musicpath,fxpath=build_score(narr)
    music,ms=sf.read(musicpath,dtype='float32',always_2d=True);fx,fs=sf.read(fxpath,dtype='float32',always_2d=True)
    if len(music)!=len(voice) or len(fx)!=len(voice) or ms!=SR or fs!=SR:raise RuntimeError('Score timing mismatch')
    musicStats=measure(musicpath);music*=10**((-26.5-float(musicStats['input_i']))/20)
    band=sosfilt(butter(2,[1700,4200],btype='bandpass',fs=SR,output='sos'),music,axis=0)
    music=(music-.32*band).astype(np.float32)
    activity=np.zeros(int(np.ceil(narr['durationSec']*100)),np.float32)
    for c in narr['cues']:
        a=max(0,round((c['startSec']-.18)*100));b=min(len(activity),round((c['endSec']+.26)*100));activity[a:b]=1
    smooth=gaussian_filter1d(activity,20)
    envelope=np.interp(np.arange(len(voice))/SR,np.arange(len(smooth))/100,smooth).astype(np.float32)
    music*=10**((-4.8*envelope[:,None])/20)
    premaster=OUT/'premaster.wav';sf.write(premaster,voice+music+fx*.40,SR,subtype='PCM_24')
    sf.write(OUT/'music-ducked.wav',music,SR,subtype='PCM_24')
    stats=measure(premaster)
    filt=(f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
          f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true")
    master=OUT/'master.wav';duration=narr['durationSec']
    # Flush the loudness filter/resampler past its end buffer, then retain the
    # exact already-composed film length. This guard is outside the soundtrack;
    # it does not insert pauses, shorten a cue, or move a music event.
    masteringFilter=f'apad=pad_len={SR//2},{filt},aresample={SR},atrim=end_sample={len(voice)}'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(premaster),'-af',masteringFilter,'-ar',str(SR),'-ac','2',
        '-c:a','pcm_s24le',str(master)],check=True)
    finalInfo=sf.info(master)
    if finalInfo.samplerate!=SR or finalInfo.channels!=2 or finalInfo.frames!=len(voice):
        raise RuntimeError('Final WAV no longer matches the exact narrative sample count')
    aac=OUT/'master-preview.m4a'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','256k','-t',str(duration),str(aac)],check=True)
    final=measure(master);aacstats=measure(aac)
    silence=subprocess.run(['ffmpeg','-hide_banner','-i',str(master),'-af','silencedetect=noise=-50dB:d=1',
        '-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    previews=[('preview-hook.mp3',0,min(28,duration))]
    for label,groupId in [('mechanism','fountain'),('return','return')]:
        g=next((g for g in narr['groups'] if g['id']==groupId),None)
        if g:previews.append((f'preview-{label}.mp3',g['startSec'],min(30,duration-g['startSec'])))
    for name,start,length in previews:
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(master),'-t',str(length),
            '-c:a','libmp3lame','-b:a','192k',str(OUT/name)],check=True)
    active=envelope>.8
    report={'seconds':duration,'sampleRate':SR,'channels':2,'timeStretch':False,'truncation':False,
        'samples':finalInfo.frames,'expectedSamples':len(voice),'sampleCountMatchesNarration':True,
        'normalizationTailFlushGuardSec':.5,'normalizationFinalSampleSelection':len(voice),
        'voiceSource':'All V5 cues from user local Qwen3-TTS-0.6B and personal rainbow鱼 reference',
        'musicTitle':'DNA档案微光 / DNA Archive Glow','musicArrangement':'re-performed for actual V5 story duration',
        'musicLoudnessBeforeDuckingTarget':-26.5,'duckDb':4.8,
        'voiceMusicDifferenceDb':db(rms(voice[active]))-db(rms(music[active])),
        'wav':final,'aac':aacstats,'subjectiveListeningChecked':False,
        'silenceDetect':[line.strip() for line in silence.stderr.splitlines() if 'silence_start:' in line or 'silence_end:' in line],
        'inputs':[{'role':role,'path':path.relative_to(ROOT).as_posix(),'sha256':sha(path)} for role,path in
                  [('narration',OUT/'narration.wav'),('music',musicpath),('transitions',fxpath),('timeline',OUT/'narration.json')]],
        'files':[{'path':path.relative_to(ROOT).as_posix(),'sha256':sha(path)} for path in
                 [master,OUT/'narration.wav',OUT/'music-ducked.wav',aac]]}
    save(OUT/'audio-mix-v5.json',report)
    if not -17<=float(final['input_i'])<=-14:raise RuntimeError('Unexpected master loudness')
    if float(aacstats['input_tp'])>-1:raise RuntimeError('AAC true peak exceeds -1 dBTP')
    print(json.dumps({k:v for k,v in report.items() if k not in ('inputs','files')},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
