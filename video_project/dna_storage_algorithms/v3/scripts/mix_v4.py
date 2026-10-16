"""Mix the user's local voice with DNA Archive Glow, preserving exact timing."""
from pathlib import Path
import json, hashlib, re, subprocess
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from scipy.signal import butter, sosfilt

V3=Path(__file__).resolve().parents[1]; OUT=V3/'work/audio-v4'; SR=48000
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def db(x): return float(20*np.log10(max(float(x),1e-12)))
def rms(x): return np.sqrt(np.mean(x*x,dtype=np.float64))
def measure(p):
    r=subprocess.run(['ffmpeg','-hide_banner','-i',str(p),'-af',
        'loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],
        capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    return json.loads(re.findall(r'\{[^{}]+\}',r.stderr,re.S)[-1])
def read_music(path,n):
    x,sr=sf.read(path,dtype='float32',always_2d=True);assert sr==SR
    # A longer film requires a deliberate musical re-score and re-positioned
    # station cues. Never pad it by arbitrary sample looping.
    if len(x)<n:
        raise RuntimeError('Voice timeline exceeds score: re-score music and move FX to new section boundaries')
    return x[:n]
def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    voice,sr=sf.read(OUT/'narration.wav',dtype='float32',always_2d=True);assert sr==SR
    duration=len(voice)/SR
    musicpath=V3/'public/music/dna_archive_glow_v4.wav'
    fxpath=V3/'public/music/dna_archive_transitions_v4.wav'
    music=read_music(musicpath,len(voice));fx=read_music(fxpath,len(voice))
    original=measure(musicpath)
    # Preserve an audible score; broad 2.5 kHz space keeps the voice legible.
    music*=10**((-26.5-float(original['input_i']))/20)
    band=sosfilt(butter(2,[1700,4200],btype='bandpass',fs=SR,output='sos'),music,axis=0)
    music=(music-.32*band).astype(np.float32)
    activity=np.zeros(round(duration*100),np.float32)
    for c in narr['cues']:
        a=max(0,round((c['startSec']-.18)*100));b=min(len(activity),round((c['endSec']+.26)*100))
        activity[a:b]=1
    smooth=gaussian_filter1d(activity,20)
    envelope=np.interp(np.arange(len(voice))/SR,np.arange(len(smooth))/100,smooth).astype(np.float32)
    music*=10**((-4.8*envelope[:,None])/20)
    mix=voice+music+fx*.40
    premix=OUT/'premaster.wav';sf.write(premix,mix,SR,subtype='PCM_24')
    stats=measure(premix)
    filt=(f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={stats['input_i']}:"
          f"measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:"
          f"measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true")
    master=OUT/'master.wav'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(premix),'-af',filt,'-ar',str(SR),'-ac','2',
                    '-t',str(duration),'-c:a','pcm_s24le',str(master)],check=True)
    sf.write(OUT/'music-ducked.wav',music,SR,subtype='PCM_24')
    final=measure(master)
    aac=OUT/'master-preview.m4a'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','256k',
                    '-t',str(duration),str(aac)],check=True)
    aacstats=measure(aac)
    for name,start,seconds,source in [('preview-hook.mp3',0,28,master),
        ('preview-mechanism.mp3',80,28,master),('preview-return.mp3',262,38,master),
        ('preview-music.mp3',75,30,musicpath)]:
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(source),'-t',str(seconds),
                        '-c:a','libmp3lame','-b:a','192k',str(OUT/name)],check=True)
    raw=OUT/'raw/n01.wav'; clean=OUT/'clean/n01.wav'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-i',str(clean),'-filter_complex',
        '[0:a]loudnorm=I=-20:TP=-2:LRA=9,aresample=48000[a];[1:a]loudnorm=I=-20:TP=-2:LRA=9,aresample=48000[b];[a][b]concat=n=2:v=0:a=1[out]',
        '-map','[out]','-c:a','pcm_s24le',str(OUT/'voice-ab.wav')],check=True)
    active=envelope>.8
    silence=subprocess.run(['ffmpeg','-hide_banner','-i',str(master),'-af','silencedetect=noise=-50dB:d=1',
        '-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    report={'seconds':duration,'sampleRate':SR,'channels':2,'timeStretch':False,'truncation':False,
        'voiceSource':'User local Qwen3-TTS-0.6B and rainbow鱼 reference, all cues freshly synthesized',
        'voiceModel':'D:/python_project/tts/models/Qwen3-TTS-0.6B',
        'rawClipSeconds':narr['totalRawSpeechClipSec'],'musicTitle':'DNA档案微光 / DNA Archive Glow',
        'musicLoudnessBeforeDuckingTarget':-26.5,'duckDb':4.8,
        'musicRmsDuringVoiceDb':db(rms(music[active])),'voiceRmsDuringVoiceDb':db(rms(voice[active])),
        'voiceMusicDifferenceDb':db(rms(voice[active]))-db(rms(music[active])),
        'wav':final,'aac':aacstats,'subjectiveListeningChecked':False,
        'silenceDetect':[line.strip() for line in silence.stderr.splitlines() if 'silence_start:' in line or 'silence_end:' in line],
        'inputs':[{'role':role,'path':p.relative_to(V3).as_posix(),'sha256':sha(p)}
                  for role,p in [('narration',OUT/'narration.wav'),('music',musicpath),
                                 ('transitions',fxpath),('timeline',OUT/'narration.json')]],
        'files':[{'path':p.relative_to(V3).as_posix(),'sha256':sha(p),
                   'duration':sf.info(p).duration if p.suffix=='.wav' else duration}
                   for p in [master,OUT/'narration.wav',OUT/'music-ducked.wav',aac]]}
    (OUT/'audio-mix-v4.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
