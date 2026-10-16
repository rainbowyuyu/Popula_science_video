"""Voice-led stereo mix, smooth phrase ducking, two-pass loudness normalization."""
from pathlib import Path
import json,hashlib,subprocess,re,math
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from scipy.signal import butter,sosfilt
V3=Path(__file__).resolve().parents[1];SR=48000
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def db(x):return 20*np.log10(max(float(x),1e-12))
def rms(x):return np.sqrt(np.mean(x*x,dtype=np.float64))
def measure(p):
 r=subprocess.run(['ffmpeg','-hide_banner','-i',str(p),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
 return json.loads(re.findall(r'\{[^{}]+\}',r.stderr,re.S)[-1])
def main():
 narr=json.loads((V3/'src/narration.json').read_text(encoding='utf8'))
 voice,sr=sf.read(V3/'public/audio/narration.wav',dtype='float32',always_2d=True);assert sr==SR
 music,_=sf.read(V3/'public/music/memory_in_a_drop.wav',dtype='float32',always_2d=True)
 fx,_=sf.read(V3/'public/music/transitions.wav',dtype='float32',always_2d=True)
 music*=10**((-30.5-db(rms(music)))/20)
 # Broad, shallow mid-frequency dip leaves consonants clear without dulling the music.
 band=sosfilt(butter(2,[1500,4200],btype='bandpass',fs=SR,output='sos'),music,axis=0)
 music=(music-.30*band).astype(np.float32)
 activity=np.zeros(30000,np.float32)
 for c in narr['cues']:
  a=max(0,round((c['startSec']-.14)*100));b=min(len(activity),round((c['endSec']+.32)*100));activity[a:b]=1
 smooth=gaussian_filter1d(activity,16)
 envelope=np.interp(np.arange(len(voice))/SR,np.arange(len(smooth))/100,smooth).astype(np.float32)
 music*=10**((-5.8*envelope[:,None])/20)
 mix=voice+music+fx*.5
 out=V3/'public/audio';premix=out/'premaster.wav';sf.write(premix,mix,SR,subtype='PCM_24')
 stats=measure(premix)
 filt=f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true:print_format=json"
 master=out/'master.wav'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(premix),'-af',filt,'-ar',str(SR),'-ac','2','-t','300','-c:a','pcm_s24le',str(master)],check=True)
 sf.write(out/'music-ducked.wav',music,SR,subtype='PCM_24')
 final=measure(master)
 # Encode AAC independently, so the delivered codec has an actual true-peak check.
 aac=out/'master-preview.m4a'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','256k','-t','300',str(aac)],check=True)
 aacstats=measure(aac)
 for name,begin,dur,source in [('preview-hook.mp3',0,28,master),('preview-mechanism.mp3',80,26,master),('preview-return.mp3',262,38,master)]:
  subprocess.run(['ffmpeg','-v','error','-y','-ss',str(begin),'-i',str(source),'-t',str(dur),'-c:a','libmp3lame','-b:a','192k',str(out/name)],check=True)
 active=envelope>.8
 # Compact same-volume raw/clean A/B; processing quality remains unlistened unless reviewed.
 a,b=narr['cues'][0],narr['cues'][0]
 raw=V3/'public/audio/raw'/f"{a['id']}.wav";clean=V3/'public'/a['audioFile']
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-i',str(clean),'-filter_complex','[0:a]loudnorm=I=-20:TP=-2:LRA=9,aresample=48000[a];[1:a]loudnorm=I=-20:TP=-2:LRA=9,aresample=48000[b];[a][b]concat=n=2:v=0:a=1[out]','-map','[out]','-c:a','pcm_s24le',str(out/'voice-ab.wav')],check=True)
 report={'seconds':300,'sampleRate':48000,'channels':2,'timeStretch':False,'truncation':False,'rawClipSeconds':narr['totalRawSpeechClipSec'],'musicTitle':'一滴里的记忆','musicRmsDuringVoiceDb':db(rms(music[active])),'voiceRmsDuringVoiceDb':db(rms(voice[active])),'voiceMusicDifferenceDb':db(rms(voice[active]))-db(rms(music[active])),'duckDb':5.8,'wav':final,'aac':aacstats,'subjectiveListeningChecked':False,'asrReview':'separate automated record; not human listening','files':[{'path':p.relative_to(V3).as_posix(),'sha256':sha(p),'duration':sf.info(p).duration if p.suffix=='.wav' else 300}for p in [master,out/'narration.wav',out/'music-ducked.wav',aac]]}
 (V3/'research/audio-mix.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({k:v for k,v in report.items()if k!='files'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
