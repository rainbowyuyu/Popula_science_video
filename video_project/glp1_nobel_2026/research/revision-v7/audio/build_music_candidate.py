"""V7 same-performance piano candidate; no public writes and no speech edits.

Shorter harmonically matched overlaps avoid blending a second dissimilar phrase.
Slow chapter envelopes hold through short speech pauses rather than pumping.
"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,math,subprocess,sys
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d,uniform_filter1d

WORK=Path(__file__).resolve().parent
ROOT=WORK.parents[2]
OUT=WORK/'candidate-01'
OUT.mkdir(exist_ok=True)
OLD=ROOT/'research/revision-v5/lemon-audio-repair'
sys.path.insert(0,str(ROOT/'scripts'))
from mix_v5 import measure
SR=48000;HOP=480;BLOCK=SR*20
RESUME_METADATA='--resume-metadata' in sys.argv
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def run(args):
 if RESUME_METADATA and Path(args[-1]).is_file():return
 subprocess.run(args,check=True,stdout=subprocess.DEVNULL)

def main():
 tl=read(ROOT/'src/timeline.json');old=read(OLD/'audio-report.json');analysis=read(OLD/'music-analysis.json')
 locked={p.relative_to(ROOT).as_posix():sha(p) for p in [ROOT/'public/narration.wav',ROOT/'public/master.wav',ROOT/'public/music.wav',ROOT/'src/timeline.json',ROOT/'docs/story-v5.json']}
 n=tl['durationFrames']*1600;duration=n/SR;source=Path(analysis['source'])
 assert sha(source)==analysis['sourceSHA256']=='42d9f922ce491372e1bc3585043f9add401f9ed4d94fb986b90a5ba2da5372a1'
 assert not (OUT/'master.wav').exists() or RESUME_METADATA,'Do not overwrite prior candidates'
 filtered=OUT/'source-piano-filtered.wav'
 eq='highpass=f=35,equalizer=f=2700:t=q:w=0.65:g=-2.6,lowpass=f=14500'
 run(['ffmpeg','-v','error','-y','-i',str(source),'-af',eq,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(filtered)])
 piano,rate=sf.read(filtered,dtype='float32',always_2d=True);assert rate==SR
 beat=np.array(analysis['beatTimes']);arrays=np.load(OLD/'music-analysis-arrays.npz');chroma=arrays['chroma'];grid=np.arange(chroma.shape[1])*256/22050
 def similarity(sa,sb,span):
  q=np.linspace(0,span,96);a=np.array([np.interp(sa+q,grid,c) for c in chroma]);b=np.array([np.interp(sb+q,grid,c) for c in chroma])
  a/=np.maximum(np.linalg.norm(a,axis=0),1e-9);b/=np.maximum(np.linalg.norm(b,axis=0),1e-9)
  return float(np.mean(np.sum(a*b,axis=0)))
 score=np.memmap(OUT/'score-work.f32',dtype='float32',mode='w+',shape=(n,2));score[:]=0
 join_records=[]
 def join(a,material,width,kind,source_a,source_b):
  w=min(width,len(material));x=np.asarray(score[a:a+w]).copy();y=material[:w]
  # Correlation-aware equal-power overlap, retaining original source gain.
  xx=float(np.mean(x.astype(np.float64)**2));yy=float(np.mean(y.astype(np.float64)**2));rho=float(np.mean(x.astype(np.float64)*y))/max((xx*yy)**.5,1e-12)
  q=np.linspace(0,1,w,dtype=np.float32);smooth=.5-.5*np.cos(np.pi*q);wa=np.cos(np.pi/2*smooth);wb=np.sin(np.pi/2*smooth)
  norm=np.sqrt(np.maximum(.5,1+2*max(0,rho)*wa*wb));wa/=norm;wb/=norm
  score[a:a+w]=x*wa[:,None]+y*wb[:,None];score[a+w:a+len(material)]=material[w:]
  join_records.append({'type':kind,'outputSeconds':a/SR,'sourceOutgoingSeconds':source_a,'sourceIncomingSeconds':source_b,
   'crossfadeSeconds':w/SR,'chromaCosineDuringOverlap':similarity(source_a,source_b,w/SR),'waveformCorrelation':rho,
   'gainLaw':'raised-cosine phase driving correlation-aware equal-power; exact unmodified source timing',
   'sourceRMSDBDifference':10*math.log10(max(yy,1e-12)/max(xx,1e-12))})
 starts=[];global_start=0.;source_start=0.;segments=[]
 # Keep the long 81/129-second body variation; match only the next four beats.
 endpoints=[328,216,328,216,328,216,328]
 pending_overlap=None
 for index,endpoint in enumerate(endpoints):
  source_end=float(beat[endpoint]);xfade=float(beat[endpoint+4]-beat[endpoint]);boundary=global_start+source_end-source_start
  a=round(global_start*SR);b=min(n,round((boundary+xfade)*SR));s=round(source_start*SR);material=piano[s:s+b-a].copy()
  if index:join(a,material,round(pending_overlap*SR),'body-loop',segments[-1]['sourceTransitionSeconds'],source_start)
  else:score[a:b]=material
  segments.append({'outputStartSeconds':global_start,'sourceStartSeconds':source_start,'sourceTransitionSeconds':source_end,'transitionOutputSeconds':boundary,'crossfadeSeconds':xfade})
  global_start=boundary;source_start=float(beat[24]);pending_overlap=xfade
 a=round(global_start*SR);s=round(source_start*SR);material=piano[s:s+n-a].copy();assert len(material)==n-a
 join(a,material,round(pending_overlap*SR),'body-loop',segments[-1]['sourceTransitionSeconds'],source_start)
 # The last source tail is retained, with a compatible four-beat bridge.
 choices=[]
 for i,stime in enumerate(beat[:-5]):
  gt=global_start+stime-source_start
  if not max(global_start+8,duration-52)<gt<duration-18:continue
  for j,tail in enumerate(beat[:-5]):
   if (j-i)%4 or tail<145:continue
   tail_end=gt+len(piano)/SR-tail
   if not duration-1.8<=tail_end<=duration:continue
   span=min(float(beat[i+4]-beat[i]),float(beat[j+4]-beat[j]));sim=similarity(stime,tail,span)
   choices.append({'outputStartSeconds':float(gt),'sourceStartSeconds':float(tail),'sourceOutgoingSeconds':float(stime),'crossfadeSeconds':span,'chromaCosine':sim,'naturalCodaEndSeconds':float(tail_end),'terminalSilenceSeconds':duration-tail_end,'score':sim-.015*(duration-tail_end)})
 coda=max(choices,key=lambda r:r['score']);a=round(coda['outputStartSeconds']*SR);s=round(coda['sourceStartSeconds']*SR)
 material=piano[s:];join(a,material,round(coda['crossfadeSeconds']*SR),'natural-coda',coda['sourceOutgoingSeconds'],coda['sourceStartSeconds']);score[a+len(material):]=0
 fade=round(2.2*SR);score[-fade:]*=(.5+.5*np.cos(np.linspace(0,np.pi,fade))).astype(np.float32)[:,None]
 fadein=round(.18*SR);score[:fadein]*=np.linspace(0,1,fadein,dtype=np.float32)[:,None];score.flush()
 voice,rate=sf.read(ROOT/'public/narration.wav',dtype='float32');assert rate==SR and len(voice)==n and voice.ndim==1
 # Only the control envelope uses a zero-padded final 10 ms analysis block.
 # The actual narration/music output always retains the exact original n samples.
 padded=np.pad(voice,(0,(-n)%HOP));rms=np.sqrt(np.mean(padded.reshape(-1,HOP)**2,axis=1));del padded
 threshold=max(.002,float(rms.max())*.06);active=rms>threshold
 vrms=float(np.sqrt(np.mean(rms[active]**2)));mrms=float(np.sqrt(np.mean(np.asarray(score[::40],dtype=np.float64)**2)))
 times=np.arange(len(rms))/100
 # Smooth content blocks: no cue snapping, no fake beats, no per-syllable riding.
 anchors=[('h001',19.0),('h008',21.0),('h016',19.1),('h018',20.6),('h028',20.0),('h033',21.2),('h045',20.2),('h060',21.4),('h066',19.4),('h069',22.0),('h078',18.8),('h084',20.0),('h085',18.8)]
 target_db=np.full(len(times),anchors[0][1]);knots=[]
 for sid,db in anchors:
  c=next(c for c in tl['clips'] if c['id']==sid);target_db[times>=c['startSeconds']]=db;knots.append({'id':sid,'startSeconds':c['startSeconds'],'voiceOverMusicTargetDB':db})
 target_db=gaussian_filter1d(target_db,250,mode='nearest')
 # Read 2-second voice power, then move at a 2-second timescale; maximum extra
 # attenuation 2.4 dB for quieter speech. Silence never drives this detector.
 local_pow=uniform_filter1d(rms.astype(np.float64)**2,201,mode='nearest');local_active=uniform_filter1d(active.astype(float),201,mode='nearest')
 speech_rms=np.sqrt(np.maximum(local_pow,0)/np.maximum(local_active,.18));relative=20*np.log10(np.maximum(speech_rms,1e-6)/vrms)
 quiet=np.clip(-relative-2.0,0,2.4);quiet[local_active<.12]=0;quiet=gaussian_filter1d(quiet,180,mode='nearest')
 target_db+=quiet
 # Preserve all ordinary breathing spaces. Only the five-second observation
 # hold gets a modest 1.2 dB arch, without a jump at either spoken boundary.
 lifts=[]
 for c,nxt in zip(tl['clips'],tl['clips'][1:]):
  a=c['voiceEndSeconds']+.8;b=nxt['startSeconds']-.4
  if b-a<3.5:continue
  idx=(times>=a)&(times<=b);q=(times[idx]-a)/(b-a);target_db[idx]-=1.2*np.sin(np.pi*q)**2
  lifts.append({'after':c['id'],'startSeconds':a,'endSeconds':b,'maxLiftDB':1.2})
 end_voice=tl['clips'][-1]['voiceEndSeconds'];q=np.clip((times-end_voice-.55)/4.8,0,1);end_lift=6.0*(.5-.5*np.cos(np.pi*q));target_db-=end_lift
 control=(vrms/mrms)*10**(-target_db/20)
 assert np.isfinite(control).all() and np.isfinite(score).all(),'Nonfinite audio/control sample'
 music=OUT/'music.wav';pre=OUT/'premaster.wav';ve=me=0.;ratios=[]
 with sf.SoundFile(music,'w',samplerate=SR,channels=2,subtype='PCM_24') as mus,sf.SoundFile(pre,'w',samplerate=SR,channels=2,subtype='FLOAT') as master:
  for offset in range(0,n,BLOCK):
   count=min(BLOCK,n-offset);g=np.interp(np.arange(offset,offset+count)/HOP,np.arange(len(control)),control).astype(np.float32)
   m=np.asarray(score[offset:offset+count])*g[:,None];v=voice[offset:offset+count];mus.write(m);master.write(m+v[:,None])
   rs=count//HOP;vpower=np.mean(v[:rs*HOP].reshape(-1,HOP).astype(np.float64)**2,axis=1);mpower=np.mean(m[:rs*HOP].reshape(-1,HOP,2).astype(np.float64)**2,axis=(1,2));act=np.sqrt(vpower)>threshold
   ve+=float(vpower[act].sum());me+=float(mpower[act].sum())
 # All voice samples enter unchanged; normalization operates once on the mix.
 prem=measure(pre);master=OUT/'master.wav'
 filt=(f"loudnorm=I=-15:TP=-2:LRA=11:measured_I={prem['input_i']}:measured_TP={prem['input_tp']}:measured_LRA={prem['input_lra']}:measured_thresh={prem['input_thresh']}:offset={prem['target_offset']}:linear=true:print_format=none,aresample={SR},apad=whole_len={n},atrim=end_sample={n}")
 run(['ffmpeg','-v','error','-n','-i',str(pre),'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(master)])
 master_measurement=measure(master);aac=OUT/'master-aac-check.m4a';run(['ffmpeg','-v','error','-n','-i',str(master),'-c:a','aac','-b:a','320k',str(aac)]);aac_measurement=measure(aac)
 assert -16<=float(aac_measurement['input_i'])<=-14 and float(aac_measurement['input_tp'])<=-1
 comparisons=[]
 for name,start,span in [('opening',0,24),('first-join',136,16),('glp1',235,24),('lipids',347,24),('pressure',475,24),('clot',650,24),('ending',829,duration-829)]:
  files={}
  for label,path in [('v6',ROOT/'public/master.wav'),('v7',master)]:
   dest=OUT/f'compare-{name}-{label}.m4a';run(['ffmpeg','-v','error','-n','-ss',str(start),'-i',str(path),'-t',str(span),'-c:a','aac','-b:a','256k',str(dest)]);files[label]={'path':str(dest.relative_to(ROOT)),'sha256':sha(dest)}
  comparisons.append({'name':name,'startSeconds':start,'durationSeconds':span,'files':files,'subjectiveListeningCompleted':False})
 # Duck control diagnostics are gain movement, not judgments about musicality.
 velocity=np.abs(np.diff(target_db))*100
 np.savez_compressed(OUT/'control-envelope.npz',seconds=times[::10],targetVoiceOverMusicDB=target_db[::10],gain=control[::10])
 report={'createdUTC':datetime.now(timezone.utc).isoformat(),'candidateOnly':True,'installed':False,
  'metadataRecoveryAfterWindowsPathKeyFix':RESUME_METADATA,
  'sourcePath':str(source),'sourceSHA256':sha(source),'musicTitle':'幽蓝键 - Lemon Tree (柠檬树) - 钢琴曲',
  'sourceType':'User-selected local recording; no new license claim','timelineSHA256':locked['src/timeline.json'],'storySHA256':locked['docs/story-v5.json'],
  'narrationSource':'public/narration.wav','narrationSHA256':locked['public/narration.wav'],'narrationSamplesUnchangedBeforeMastering':True,
  'voiceSpeedFactor':1,'pitchShiftSemitones':0,'timeStretch':False,'addedPercussion':False,'durationSeconds':duration,'sampleRate':SR,'samples':n,
  'musicEQ':eq,'phraseSegments':segments,'overlapEvidence':join_records,'naturalCoda':coda,
  'mixPolicy':'Slow 2.5-second-smoothed content blocks; voice detector sees 2-second windows and moves over 1.8 seconds; ordinary short pauses stay held; no beat-locked ducking or per-syllable pumping.',
  'contentKnots':knots,'longPauseLifts':lifts,'endingMusicRiseDB':6,'quietVoiceMaxAdditionalDuckingDB':2.4,
  'controlSlopeDBPerSecond':{'max':float(velocity.max()),'p95':float(np.percentile(velocity,95))},
  'voiceOverMusicActiveDB':10*math.log10(ve/me),'masterMeasurement':master_measurement,'aacMeasurement':aac_measurement,'premasterMeasurement':prem,
  'comparisonWithV6':{'voiceOverMusicActiveDB':old['voiceOverMusicActiveDB'],'oldBodyOverlapSeconds':[s['crossfadeSeconds'] for s in old['phraseSegments']],
    'note':'V6 overlapped eight estimated beats; V7 overlaps only the matching four-beat section. Chroma and waveform checks are objective aids, not listening approval.'},
  'comparisonExtracts':comparisons,'lockedProductionInputs':locked,'subjectiveListeningCompleted':False,
  'limitations':['Beat phase and harmony are numerical estimates, not a manually transcribed score.','No subjective full listening completed.','Final video needs timing and full mux re-verification after this audio is accepted.'],
  'hashes':{name:sha(OUT/name) for name in ['music.wav','master.wav','master-aac-check.m4a','control-envelope.npz']},'scriptSHA256':sha(__file__)}
 for path,value in locked.items():assert sha(ROOT/path)==value,'Production input changed during candidate build: '+path
 assert sf.info(master).frames==n and sf.info(music).frames==n
 save(OUT/'audio-candidate-report.json',report)
 del score
 (OUT/'score-work.f32').unlink()
 # This FLOAT premix is an exactly regenerable intermediate, not a source take.
 pre.unlink()
 print(json.dumps({'candidateReady':True,'installed':False,'masterSHA256':report['hashes']['master.wav'],'aacMeasurement':aac_measurement,'voiceOverMusicActiveDB':report['voiceOverMusicActiveDB'],'controlSlopeDBPerSecond':report['controlSlopeDBPerSecond']},ensure_ascii=False))
if __name__=='__main__':main()
