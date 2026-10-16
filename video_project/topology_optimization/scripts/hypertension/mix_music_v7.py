"""Mix the V7 chamber score without editing speech, subtitles or timing.

Reproduce: python scripts/hypertension/fetch_music_v7_samples.py
           python scripts/hypertension/score_v7.py
           python scripts/hypertension/mix_music_v7.py
"""
from pathlib import Path
from types import SimpleNamespace
import hashlib,json,math,subprocess,sys,tempfile
import numpy as np
import soundfile as sf
from scipy.signal import welch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
import prepare_episode3v7 as pipeline
from score_v7 import TITLE,BPM,SEED

PUB=ROOT/'public/hypertension';REPORTS=ROOT/'research/hypertension';SR=48000
FFMPEG='C:/ffmpeg/bin/ffmpeg.exe'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,d):Path(p).write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
def rms(x):return float(np.sqrt(np.mean(x.astype(np.float64)**2)))
def db(x):return 20*np.log10(max(float(x),1e-12))
def run(args):subprocess.run([FFMPEG,'-hide_banner','-nostats','-v','error','-y']+list(map(str,args)),check=True)
def montage(x,sr,ranges):
    pieces=[]
    for a,b in ranges:
        y=x[round(a*sr):round(b*sr)].copy();fade=min(round(.35*sr),len(y)//2)
        y[:fade]*=np.linspace(0,1,fade)[:,None];y[-fade:]*=np.linspace(1,0,fade)[:,None]
        pieces.extend([y,np.zeros((round(.35*sr),2),np.float32)])
    return np.concatenate(pieces)

def main():
    protected=[PUB/'narration.wav',PUB/'timeline.json',PUB/'subtitles.srt',ROOT/'src/hypertension/timeline.json',REPORTS/'story.json']
    protected+=list((PUB/'voice-raw').glob('*.wav'))+list((PUB/'voice').glob('*.wav'))
    before={str(p.relative_to(ROOT)):sha(p) for p in protected}
    timeline=json.loads((PUB/'timeline.json').read_text('utf8'));fps=timeline['fps']
    expected=timeline['duration']*SR//fps
    narration,sr=sf.read(PUB/'narration.wav',dtype='float32',always_2d=True)
    music,msr=sf.read(REPORTS/'music-v7-unducked.wav',dtype='float32',always_2d=True)
    assert sr==msr==SR and len(narration)==len(music)==expected
    # Save only a short review sample of the previous mix; no shared source
    # deletion or large duplicate soundtrack is needed for a fair comparison.
    prior_qa=REPORTS/'music-v7-qa.json'
    if prior_qa.exists() and (REPORTS/'mix-v6-v7-AB.wav').exists() and (REPORTS/'music-v6-v7-AB.wav').exists():
        # Idempotent reruns retain the actual V6 reference, rather than quietly
        # turning an A/B into V7-versus-V7 after master.wav has been replaced.
        previous=json.loads(prior_qa.read_text('utf8'))
        old,_=sf.read(REPORTS/'mix-v6-v7-AB.wav',dtype='float32',always_2d=True,stop=18*SR)
        old_music,_=sf.read(REPORTS/'music-v6-v7-AB.wav',dtype='float32',always_2d=True,stop=18*SR)
        old_music_sha=previous['previousMusicSha256'];old_master_sha=previous['previousMasterSha256']
    else:
        old,_=sf.read(PUB/'master.wav',dtype='float32',always_2d=True,start=round(52*SR),stop=round(70*SR))
        old_music,_=sf.read(PUB/'music.wav',dtype='float32',always_2d=True,start=round(52*SR),stop=round(70*SR))
        old_music_sha=sha(PUB/'music.wav');old_master_sha=sha(PUB/'master.wav')
    active=np.zeros(len(narration),bool)
    controls=math.ceil(len(narration)/SR*100);gain=np.ones(controls,np.float32)
    for clip in timeline['clips']:
        a=clip['start']*SR//fps;b=clip['end']*SR//fps;active[a:b]=True
        ca=max(0,math.floor((clip['start']/fps-.12)*100));cb=min(controls,math.ceil((clip['end']/fps+.25)*100))
        gain[ca:cb]=.56
    for i in range(1,controls):gain[i]=min(gain[i],gain[i-1]+1/125)
    for i in range(controls-2,-1,-1):gain[i]=min(gain[i],gain[i+1]+1/18)
    with tempfile.TemporaryDirectory(prefix='hypertension-v7-mix-') as tmp:
        tmp=Path(tmp);eq=tmp/'music-eq.wav';pre=tmp/'premaster.wav';aac=tmp/'verification.m4a'
        run(['-i',REPORTS/'music-v7-unducked.wav','-af','highpass=f=50,equalizer=f=2500:t=q:w=0.8:g=-2.5','-c:a','pcm_f32le',eq])
        music,_=sf.read(eq,dtype='float32',always_2d=True)
        music*=np.interp(np.arange(len(music))/SR,np.arange(controls)/100,gain)[:,None]
        music*=rms(narration[active])/max(rms(music[active]),1e-12)/10**(17/20)
        sf.write(PUB/'music.wav',music,SR,subtype='PCM_24')
        sf.write(pre,narration+music,SR,subtype='FLOAT')
        measured=pipeline.measure_loudness(pre)
        filt='loudnorm=I=-15.8:TP=-1.7:LRA=9:linear=true:'+':'.join(f'{k}={measured[v]}' for k,v in
             [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
        run(['-i',pre,'-af',filt,'-ar',SR,'-ac',2,'-c:a','pcm_s24le',PUB/'master.wav'])
        run(['-i',PUB/'master.wav','-c:a','aac','-b:a','320k',aac])
        master_metrics=pipeline.measure_loudness(PUB/'master.wav');aac_metrics=pipeline.measure_loudness(aac)
        assert float(aac_metrics['input_tp'])<=-1.0
        assert -16.5<=float(master_metrics['input_i'])<=-15.0
        assert sf.info(PUB/'master.wav').frames==expected
        final,_=sf.read(PUB/'master.wav',dtype='float32',always_2d=True)
        sf.write(PUB/'mix-preview.wav',final[:round(24*SR)],SR,subtype='PCM_24')
        ranges=[(0,14),(58,72),(146,160),(278,292)]
        full_stem,_=sf.read(REPORTS/'music-v7-unducked.wav',dtype='float32',always_2d=True)
        sf.write(REPORTS/'music-v7-listening-preview.wav',montage(full_stem,SR,ranges),SR,subtype='PCM_24')
        sf.write(REPORTS/'mix-v7-listening-preview.wav',montage(final,SR,ranges),SR,subtype='PCM_24')
        # Matched-RMS A/B, in the order V6 then V7, makes timbre/rhythm changes
        # reviewable without a loudness advantage for the new arrangement.
        new=final[round(52*SR):round(70*SR)].copy();old*=rms(new)/max(rms(old),1e-12)
        sep=np.zeros((round(.8*SR),2),np.float32)
        sf.write(REPORTS/'mix-v6-v7-AB.wav',np.concatenate([old,sep,new]),SR,subtype='PCM_24')
        new_music=full_stem[round(52*SR):round(70*SR)].copy()
        old_music*=rms(new_music)/max(rms(old_music),1e-12)
        sf.write(REPORTS/'music-v6-v7-AB.wav',np.concatenate([old_music,sep,new_music]),SR,subtype='PCM_24')
    after={str(p.relative_to(ROOT)):sha(p) for p in protected}
    assert after==before,'Speech, story, subtitles or timing was changed'
    mix={'trackTitle':TITLE,'sameEpisodeRearrangement':False,'tempoBpm':BPM,
      'source':'Original note-by-note chamber composition; CC0 VSCO 2 CE acoustic piano, harp, viola, cello, pizzicato and quiet conga tap',
      'acousticRecordings':True,'foreignMusicSamples':False,'licensedInstrumentSamples':True,
      'sampleLicense':'CC0-1.0','sampleManifest':'research/hypertension/music-v7-samples/manifest.json',
      'narrationAboveMusicActiveRmsDb':db(rms(narration[active])/rms(music[active])),
      'duckAttackSeconds':.18,'duckLookaheadSeconds':.12,'duckReleaseSeconds':1.25,
      'musicSha256':sha(PUB/'music.wav'),'masterSha256':sha(PUB/'master.wav'),'masterFrames':expected,
      'masterMeasurement':master_metrics,'aacVerificationMeasurement':aac_metrics,
      'sourceNarrationUnchanged':True,'protectedFileHashesUnchanged':True,'subjectiveListeningChecked':False,
      'reusedPreviousEpisodeMusic':False,'scoreSeed':SEED,
      'previews':['mix-preview.wav','research/hypertension/music-v7-listening-preview.wav','research/hypertension/mix-v7-listening-preview.wav','research/hypertension/mix-v6-v7-AB.wav']}
    dump(REPORTS/'audio-mix.json',mix)
    # Existing rigorous voice/caption checks run read-only against the frozen
    # 53-clips timeline. No mastering or speech regeneration is performed.
    args=SimpleNamespace(story=REPORTS/'story.json',public_root=PUB,report_dir=REPORTS)
    pipeline.final_qa(args)
    f,p=welch(full_stem.mean(axis=1),SR,nperseg=8192)
    band_power={f'{a}-{b}Hz':float(10*np.log10(max(1e-20,p[(f>=a)&(f<b)].sum())/p.sum())) for a,b in [(0,100),(100,1000),(1000,3000),(3000,8000),(8000,24000)]}
    section_rms={s['id']:db(rms(full_stem[s['start']*SR//fps:s['end']*SR//fps])) for s in timeline['scenes']}
    qa={'status':'passed','title':TITLE,'seconds':expected/SR,'frames':timeline['duration'],'fps':fps,'clips':len(timeline['clips']),
        'protectedInputs':before,'inputHashesUnchanged':True,'previousMusicSha256':old_music_sha,'previousMasterSha256':old_master_sha,
        'musicSha256':mix['musicSha256'],'masterSha256':mix['masterSha256'],'unduckedStemSha256':sha(REPORTS/'music-v7-unducked.wav'),
        'sampleBankManifestSha256':sha(SAMPLES_MANIFEST),'scoreScriptSha256':sha(ROOT/'scripts/hypertension/score_v7.py'),
        'stemPeakDbfs':db(abs(full_stem).max()),'stemRmsDbfs':db(rms(full_stem)),
        'stemStereoCorrelation':float(np.corrcoef(full_stem[::50,0],full_stem[::50,1])[0,1]),
        'stemNonFiniteSamples':int(np.count_nonzero(~np.isfinite(full_stem))),
        'stemSpectrumRelativePowerDb':band_power,'stemSectionRmsDbfs':section_rms,
        'voiceToMusicActiveRmsDb':mix['narrationAboveMusicActiveRmsDb'],'masterLufs':float(master_metrics['input_i']),
        'aacTruePeakDbtp':float(aac_metrics['input_tp']),'subjectiveListeningChecked':False,
        'evaluation':'Full generated waveform, stereo, spectral bands, section dynamics, actual voice/music ratio, matched-level A/B export, complete audio decode and AAC measurements. No human or claimed auditory pleasantness certification.',
        'previewRangesSeconds':ranges,'ABOrder':'V6 52-70s, 0.8s silence, V7 52-70s; RMS matched'}
    dump(REPORTS/'music-v7-qa.json',qa)
    hist=Path('C:/Users/zju/.codex/skills/rainbow-science-short/references/music-history.json')
    d=json.loads(hist.read_text(encoding='utf-8-sig'));records=[r for r in d['records'] if r.get('video')!='rainbow hypertension formation v7']
    records.append({'video':'rainbow hypertension formation v7','title':TITLE,'artist':'rainbow鱼 original chamber composition',
      'sha256':mix['musicSha256'],'masterSha256':mix['masterSha256'],'source':'scripts/hypertension/score_v7.py / seed 202610177; VSCO 2 CE CC0 acoustic samples',
      'status':'selected and mixed for V7','tempoBpm':BPM,'durationSeconds':expected/SR,
      'instrumentation':'soft upright piano, harp, viola/cello, pizzicato, quiet conga tap','sampleLicense':'CC0-1.0'})
    d['records']=records;dump(hist,d)
    print(json.dumps({k:v for k,v in qa.items() if k not in ['protectedInputs','stemSpectrumRelativePowerDb','stemSectionRmsDbfs']},ensure_ascii=False,indent=2),flush=True)

SAMPLES_MANIFEST=REPORTS/'music-v7-samples/manifest.json'
if __name__=='__main__':main()
