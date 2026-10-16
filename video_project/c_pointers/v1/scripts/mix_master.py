"""User clone + measured Hypnotic phrases, voice-aware center reduction and ducking."""
import json,subprocess,shutil
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d,maximum_filter1d
from scipy.signal import butter,sosfilt
from audio_common import ROOT,OUT,MUSIC,SR,sha,save,measure
from audio_music import arrange

def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'));duration=narr['durationSec']
    voice,sr=sf.read(OUT/'narration.wav',dtype='float32',always_2d=True)
    assert sr==SR and len(voice)==round(duration*SR)
    path,arr=arrange(duration);music,ms=sf.read(path,dtype='float32',always_2d=True)
    assert ms==SR
    stats=measure(path);music*=10**((-25-float(stats['input_i']))/20)
    # Measured speech envelopes, pre-roll and long release prevent syllabic pumping.
    block=480;v=np.pad(voice[:,0],(0,(-len(voice))%block)).reshape(-1,block)
    rms=np.sqrt(np.mean(v*v,axis=1));active=(rms>max(.002,float(rms.max())*.025)).astype(np.float32)
    hold=maximum_filter1d(active,size=73,mode='nearest')
    smooth=gaussian_filter1d(hold,18)
    envelope=np.interp(np.arange(len(voice))/SR,np.arange(len(smooth))/100,smooth).astype(np.float32)
    # This is restrained mid/side spectral attenuation, NOT claimed vocal separation.
    # Keep bass/kick below 900Hz and the stereo instrument field. Main vocal and narration
    # overlap most in the centered 1.1–5.2kHz band; lower it only while speaking.
    mid=(music[:,0]+music[:,1])*.5
    centerband=sosfilt(butter(2,[1100,5200],btype='bandpass',fs=SR,output='sos'),mid).astype(np.float32)
    music-=centerband[:,None]*envelope[:,None]*.52
    # Additional modest broad presence room avoids sharp lyric consonants.
    speechband=sosfilt(butter(2,[2000,4200],btype='bandpass',fs=SR,output='sos'),music,axis=0).astype(np.float32)
    music-=speechband*envelope[:,None]*.15
    music*=10**((-5.2*envelope[:,None])/20)
    # Dense arithmetic needs slightly more room; interpolate at scene centers.
    points=[]
    for group in narr['groups']:
        gain=-.7 if group['id'] in ('arithmetic','bounds','lifetime') else 0
        points.append(((group['startSec']+group['endSec'])/2,gain))
    if points:
        curve=np.interp(np.arange(len(music))/SR,[p[0] for p in points],[p[1] for p in points])
        music*=10**(curve[:,None]/20)
    score=OUT/'score-ducked.wav';sf.write(score,music,SR,subtype='PCM_24')
    premaster=OUT/'premaster.wav';sf.write(premaster,voice+music,SR,subtype='PCM_24')
    v=measure(premaster)
    filt=(f"loudnorm=I=-16:TP=-1.7:LRA=9:measured_I={v['input_i']}:measured_TP={v['input_tp']}:"
          f"measured_LRA={v['input_lra']}:measured_thresh={v['input_thresh']}:offset={v['target_offset']}:linear=true")
    master=OUT/'master.wav'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(premaster),'-af',
        f'apad=pad_len={SR//2},{filt},aresample={SR},atrim=end_sample={len(voice)}',
        '-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(master)],check=True)
    aac=OUT/'master-preview.m4a'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','256k','-t',str(duration),str(aac)],check=True)
    final=measure(master);aacstats=measure(aac);info=sf.info(master)
    assert info.frames==len(voice) and info.channels==2 and info.samplerate==SR
    assert -17<=float(final['input_i'])<=-15 and float(final['input_tp'])<=-1.5
    assert float(aacstats['input_tp'])<=-1
    silence=subprocess.run(['ffmpeg','-hide_banner','-i',str(master),'-af','silencedetect=noise=-50dB:d=1','-f','null','-'],
        capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    previews=[('preview-opening.mp3',0,30)]
    for i,join in enumerate(arr['joins']):previews.append((f'preview-loop-{i+1}.mp3',join['atSec']-6,12))
    for name,start,length in previews:
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(master),'-t',str(length),'-c:a','libmp3lame','-b:a','192k',str(OUT/name)],check=True)
    public=ROOT/'public/audio';public.mkdir(parents=True,exist_ok=True)
    shutil.copy2(master,public/'master.wav');shutil.copy2(OUT/'narration.wav',public/'narration.wav')
    active=envelope>.8
    difference=20*np.log10(max(float(np.sqrt(np.mean(voice[active]**2))),1e-9)/max(float(np.sqrt(np.mean(music[active]**2))),1e-9))
    report={'durationSec':duration,'sampleRate':SR,'channels':2,'samples':info.frames,'exactDuration':True,
        'voiceSource':'User Qwen3-TTS-0.6B + existing personal rainbow鱼 reference; local RTX5060 and user-owned H100, identical model/reference hashes','narrationCueCount':len(narr['cues']),
        'timeStretch':False,'voiceTruncation':False,'musicTitle':MUSIC.stem,'sourceMusicSha256':sha(MUSIC),
        'musicNormalizationBeforeDuckLUFS':-25,'duckDb':5.2,'voiceMusicRmsDifferenceDb':float(difference),
        'centerReduction':{'bandHz':[1100,5200],'maximumBandSubtraction':.52,'onlyWhileNarrating':True,'isStemSeparation':False},
        'musicLoopJoins':arr['joins'],'masterWav':final,'encodedAAC':aacstats,'subjectiveListeningChecked':False,
        'silenceDetect':[x.strip() for x in silence.stderr.splitlines() if 'silence_start:' in x or 'silence_end:' in x],
        'files':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)} for p in (master,public/'master.wav',OUT/'narration.wav',path,aac)]}
    save(OUT/'audio-qa.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':main()
