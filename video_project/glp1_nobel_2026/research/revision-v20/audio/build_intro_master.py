"""Replace only the opening utterance, preserving all later PCM samples."""
from pathlib import Path
import json,hashlib,sys,subprocess,shutil,difflib
import numpy as np
import soundfile as sf

OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2];SR=48000
sys.path.insert(0,str(ROOT/'scripts'))
from qc_v5 import chars
from mix_v5 import measure
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def run(args):subprocess.run(args,check=True,capture_output=True)

def main():
 tl=read(ROOT/'src/timeline.json');old=next(c for c in tl['clips'] if c['id']=='h001')
 record=read(OUT/'candidate-01/take.json');ar=read(OUT/'candidate-01/asr.json')
 assert chars(ar['expected']).replace('麽','么')==chars(ar['heard']).replace('麽','么')
 voice,rate=sf.read(record['processed'],dtype='float64');assert rate==SR
 start=round(old['startSeconds']*SR);end=round(old['endSeconds']*SR)
 assert start+len(voice)<=end-int(.2*SR)
 oldmaster=ROOT/'public/master.wav';oldmusic=ROOT/'public/music.wav';oldnarration=ROOT/'public/narration.wav'
 locked={p.relative_to(ROOT).as_posix():sha(p) for p in [oldmaster,oldmusic,oldnarration]}
 master,rate=sf.read(oldmaster,frames=end,dtype='float64');music,_=sf.read(oldmusic,frames=end,dtype='float64')
 narration,_=sf.read(oldnarration,frames=end,dtype='float64')
 oldvoice=narration[start:start+round(old['voiceDurationSeconds']*SR)]
 def active_rms(x):
  f=x[:len(x)//480*480].reshape(-1,480);r=np.sqrt(np.mean(f*f,axis=1));f=f[r>.01];return float(np.sqrt(np.mean(f*f)))
 sentence_gain=active_rms(oldvoice)/active_rms(voice)
 # The old master contains a limiter, so subtracting its old voice would leave
 # residual syllables. Rebuild this short interval from the unchanged music stem.
 fitted_gains=[]
 for a,b in [(2.,3.),(5.,6.)]:
  l,r=int(a*SR),int(b*SR);p=music[l:r]+narration[l:r,None];m=master[l:r]
  fitted_gains.append(float(np.sum(p*m)/np.sum(p*p)))
 gain=float(np.mean(fitted_gains))
 replacement=music.copy();replacement[start:start+len(voice)]+=voice[:,None]*sentence_gain
 premix=OUT/'intro-premix.wav';sf.write(premix,replacement,SR,subtype='FLOAT')
 limited=OUT/'intro-limited.wav'
 run(['ffmpeg','-v','error','-y','-i',str(premix),'-af',f'volume={gain},alimiter=limit=0.794328:attack=5:release=65:level=false:latency=true,apad=whole_len={end},atrim=end_sample={end}','-ar',str(SR),'-c:a','pcm_s24le',str(limited)])
 replacement,_=sf.read(limited,dtype='float64');assert len(replacement)==end
 # Rejoin in the music-only pause, after both the previous and new utterance.
 join_a=max(start+len(voice)+round(.15*SR),round((old['voiceEndSeconds']+.15)*SR))
 join_b=round(9.75*SR);assert join_a<join_b<end
 t=np.linspace(0,1,join_b-join_a);blend=.5-.5*np.cos(np.pi*t)
 replacement[join_a:join_b]=replacement[join_a:join_b]*(1-blend[:,None])+master[join_a:join_b]*blend[:,None]
 replacement[join_b:]=master[join_b:];replacement[:start]=master[:start]
 target=ROOT/'public/master-v20.wav'
 assert not (OUT/'audio-report.json').exists(),'A completed V20 master is frozen; use a new revision'
 with sf.SoundFile(oldmaster) as source,sf.SoundFile(target,'w',samplerate=SR,channels=2,subtype='PCM_24') as f:
  f.write(replacement);source.seek(end)
  while True:
   unchanged=source.read(SR*20,dtype='int32')
   if not len(unchanged):break
   f.write(unchanged)
 maxerr=0
 with sf.SoundFile(oldmaster) as a,sf.SoundFile(target) as b:
  assert len(a)==len(b)==tl['duration']*1600
  a.seek(end);b.seek(end)
  while True:
   x=a.read(SR*20,dtype='int32');y=b.read(SR*20,dtype='int32')
   if not len(x):break
   maxerr=max(maxerr,int(np.max(np.abs(x.astype(np.int64)-y.astype(np.int64)))))
 assert maxerr==0
 # Preserve precise display text; word timing comes from independent ASR.
 cap=[]
 for i,(text,s,e) in enumerate([
  ('一顿饭吃下去，血糖会升高。',.4,2.96),
  ('身体怎么把它稳住？',3.22,4.56),
  ('这和血压、血脂，又有什么关系？',4.80,7.48),
 ]):
  cap.append(dict(id=f'h001-c{i+1}',clipId='h001',text=text,start=round(s*30),end=round(e*30),sourceSHA256=record['sha256'],asrCacheKey=sha(OUT/'candidate-01/asr.json'),timingSource='V20 unprompted no-VAD Whisper word timing; brief sentence-end reading hold'))
 assert ''.join(c['text'] for c in cap)==record['text']
 fields=dict(text=record['text'],ttsText=record['ttsText'],caption=record['caption'],voiceEndSeconds=.4+len(voice)/SR,spokenEndSeconds=.4+len(voice)/SR,voiceDurationSeconds=len(voice)/SR,audioSHA256=record['sha256'],audio='voice-v20/h001.wav',audioSource=str(Path(record['processed']).relative_to(ROOT).as_posix()),takeSHA256=sha(OUT/'candidate-01/take.json'),additionalPauseAfterSeconds=1.7,effectivePauseAfterSeconds=1.9)
 save(OUT/'h001-timeline-patch.json',dict(id='h001',setFields=fields,replaceCaptionsForClip=cap,preserveStartFrame=12,preserveEndFrame=297,masterPath='public/master-v20.wav',note='Only h001 narration and its captions change. Keep all shot frame boundaries. Copy selected h001 source to public/voice-v20/h001.wav when installing.'))
 preview=OUT/'preview-with-music-10s.m4a'
 run(['ffmpeg','-v','error','-y','-i',str(target),'-t','10','-c:a','aac','-b:a','320k',str(preview)])
 for label,path in [('raw',Path(record['raw'])),('processed',Path(record['processed']))]:
  run(['ffmpeg','-v','error','-y','-i',str(path),'-af','loudnorm=I=-19:TP=-2:LRA=11','-ar',str(SR),'-c:a','pcm_s24le',str(OUT/f'AB-{label}.wav')])
 measurement=measure(target);aac_measurement=measure(preview)
 report=dict(selectedCandidate='candidate-01',master=str(target),masterSHA256=sha(target),fullDurationSeconds=sf.info(target).duration,totalFrames=tl['duration'],sampleRate=SR,firstUtterance=fields,subtitlePatch='h001-timeline-patch.json',naturalSpeechSourceSeconds=len(voice)/SR,timeStretch=False,trimmed=False,asrNormalizedExact=True,unpromptedASR=ar['heard'],asrNormalization='Windows simplified Chinese normalization plus punctuation removal',sourceVoiceGainDB=float(20*np.log10(sentence_gain)),introMasterGainDB=float(20*np.log10(gain)),limiter='5ms compensated lookahead, -2dBFS ceiling; opening interval only',musicSourceUnchanged=locked['public/music.wav'],musicOnlyRejoinSeconds=[join_a/SR,join_b/SR],allSamplesAfter9_9SecondsIdentical=True,maximumPCM32DifferenceAfter9_9Seconds=maxerr,fullMasterMeasurement=measurement,previewAACMeasurement=aac_measurement,preview=str(preview),sourceLocks=locked,subjectiveListeningChecked=False,limitations='ASR and signal checks do not replace subjective listening. The platform flag does not identify a confirmed causal phrase.')
 assert all(sha(ROOT/k)==v for k,v in locked.items())
 save(OUT/'audio-report.json',report)
 print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
