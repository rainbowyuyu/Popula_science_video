"""Arrange the user-selected track with measured pulse/chroma-compatible repeats."""
from pathlib import Path
import argparse,datetime,json,math,shutil,sys
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import gaussian_filter1d
import replace_requested_music as mix
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'audio/feisheng';SR=48000
ap=argparse.ArgumentParser();ap.add_argument('--apply',action='store_true');args=ap.parse_args()
read=mix.read;save=mix.save;sha=mix.digest
analysis=read(BASE/'analysis.json');source=Path(analysis['source']['path'])
assert sha(source)==analysis['source']['sha256']
tl=read(ROOT/'public/timeline.json');assert tl==read(ROOT/'src/timeline.json')
tlsha=sha(ROOT/'public/timeline.json');vsha=sha(ROOT/'public/narration.wav')
voice,rate=sf.read(ROOT/'public/narration.wav',dtype='float32');assert rate==SR and voice.ndim==1
total=tl['duration']*1600;duration=total/SR;assert len(voice)==total
work=BASE/'mixes'/(datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+tlsha[:8]);work.mkdir(parents=True)
ffmpeg=mix.executable('ffmpeg');decoded=BASE/'source-48k.wav'
if not decoded.exists():
 mix.run([ffmpeg,'-v','error','-n','-i',source,'-map','0:a:0','-vn','-map_metadata','-1','-ar',SR,'-ac','2','-c:a','pcm_s24le',decoded])
audio,rate=sf.read(decoded,dtype='float32',always_2d=True);assert rate==SR
original_source_duration=len(audio)/SR
# Retain the final strong cadence (around 280 s) and its audible decay, but
# remove the original recording's near-silent trailing reverb. It must
# not become an unintended music gap during the closing references.
effective_source_end=285.0
assert original_source_duration>effective_source_end
audio=audio[:round(effective_source_end*SR)]
period=60/analysis['fittedTempoBPM'];offset=analysis['fittedPulseOffset_s'];bar=4*period
features=np.load(BASE/'analysis-features.npz');chroma=features['chroma'];ct=features['chromaTimes']
def context(t):return np.stack([np.interp(t+np.arange(-8,8,.25)*period,ct,x) for x in chroma])
def similarity(start,end):
 a,b=context(start),context(end)
 return float((a*b).sum()/np.sqrt((a*a).sum()*(b*b).sum()))
# Preserve this recording's native quiet-to-dense progression. Recurrences are
# chosen against its own harmonic context, percussion pattern and local level.
units=max(0,round((duration-len(audio)/SR)/(8*bar)))
counts=[0]*5
for i in range(units):counts[i%5]+=1
regions=read(BASE/'phrase-search.json')['regions']
plans=[]
for slot,(region,count) in enumerate(zip(regions,counts)):
 if not count:continue
 eligible=[x for x in region['options'] if x['spanBars']==8 or count%2==0]
 best=max(eligible,key=lambda x:x['score'])
 longer=[x for x in eligible if x['spanBars']==16 and x['score']>=best['score']-.007]
 if longer:best=max(longer,key=lambda x:x['score'])
 span=best['spanBars'];repetitions=count//(span//8)
 assert best['chroma']>=.90 and best['rhythm']>=.90 and abs(best['levelDifference_dB'])<1.5,best
 plans.append(dict(slot=slot,sourceStart_s=best['start'],sourceEnd_s=best['end'],bars=span,repetitions=repetitions,
  harmonicContextCosine=best['chroma'],percussionPatternCosine=best['rhythm'],levelDifferenceDB=best['levelDifference_dB'],
  sourceEndBarEditorial=best['endBar']))
plans.sort(key=lambda x:x['sourceEnd_s'])
pieces=[];piece_info=[];cursor=0;film_cursor=0
def append(a,b,kind,slot=None):
 global film_cursor
 if b<=a:return
 pieces.append(audio[a:b]);piece_info.append(dict(sourceStartSample=a,sourceEndSample=b,
 outputStartSample=film_cursor,outputEndSample=film_cursor+b-a,kind=kind,slot=slot));film_cursor+=b-a
for plan in plans:
 a=round(plan['sourceStart_s']*SR);b=round(plan['sourceEnd_s']*SR)
 append(cursor,b,'original')
 for _ in range(plan['repetitions']):append(a,b,'matched phrase reprise',plan['slot'])
 cursor=b
append(cursor,len(audio),'original ending')
arranged=np.concatenate(pieces);seams=[];half=round(.5*period*SR)
for prev,current in zip(piece_info,piece_info[1:]):
 if prev['sourceEndSample']==current['sourceStartSample']:continue
 cut=current['outputStartSample'];old=prev['sourceEndSample'];new=current['sourceStartSample']
 assert old-half>=0 and new-half>=0 and old+half<=len(audio) and new+half<=len(audio)
 w=np.sin(np.linspace(0,np.pi/2,2*half,endpoint=True,dtype=np.float32))**2
 arranged[cut-half:cut+half]=audio[old-half:old+half]*(1-w[:,None])+audio[new-half:new+half]*w[:,None]
 seams.append(dict(unscaledFilmTime_s=cut/SR,sourceFrom_s=old/SR,sourceTo_s=new/SR,
                   crossfade_s=2*half/SR,harmonicContextCosine=similarity(new/SR,old/SR)))
sf.write(work/'phrase-arrangement.wav',arranged,SR,subtype='PCM_24')
tempo_factor=len(arranged)/total
assert .97<=tempo_factor<=1.03,('Duration cannot be fitted within protected tempo range',tempo_factor)
raw_scaled=work/'music-time-fit.wav'
mix.run([ffmpeg,'-v','error','-y','-i',work/'phrase-arrangement.wav','-af',f'rubberband=tempo={tempo_factor:.10f}:pitch=1',
 '-ar',SR,'-ac',2,'-c:a','pcm_s24le',raw_scaled])
scaled,rate=sf.read(raw_scaled,dtype='float32',always_2d=True)
timefit_frames=len(scaled);delta=len(scaled)-total
assert abs(delta)<SR*.12,('Unexpected time-fit tail difference',delta)
music=np.pad(scaled,((0,max(0,total-len(scaled))),(0,0)))[:total]
del pieces,arranged,scaled
# Tonal balance automation changes detail/space under narration, never pitch or
# the tempo of individual chapters. Curves move over eight measured beats.
final_period=period/tempo_factor;final_offset=offset/tempo_factor
hop=480;t=np.arange(math.ceil(total/hop))*hop/SR
levels={'hook':1.07,'foundation':.88,'core':.91,'frame':.97,'skin':.92,'wind':.94,'damper':.88,'assembly':1.10,'return':1.02,'references':1.15}
details={'hook':1.0,'foundation':.58,'core':.66,'frame':.83,'skin':.73,'wind':.80,'damper':.57,'assembly':1.0,'return':.86,'references':.91}
level=np.ones(len(t));detail=np.ones(len(t));section_events=[]
for section in tl['sections']:
 start=section['start']/tl['fps'];end=section['end']/tl['fps'];sid=section['id']
 a=max(0,round((start-final_offset)/(4*final_period)));beat_entry=final_offset+a*4*final_period
 mask=(t>=beat_entry)&(t<end+4*final_period)
 level[mask]=levels.get(sid,1);detail[mask]=details.get(sid,1)
 section_events.append(dict(section=sid,start_s=start,end_s=end,musicalEntry_s=beat_entry,
                          sectionGain=levels.get(sid,1),highFrequencyDetail=details.get(sid,1)))
level=gaussian_filter1d(level,(2*final_period)/.01,mode='nearest')
detail=gaussian_filter1d(detail,(2*final_period)/.01,mode='nearest')
times=np.arange(total)/SR;level_s=np.interp(times,t,level).astype(np.float32);detail_s=np.interp(times,t,detail).astype(np.float32)
low=signal.sosfiltfilt(signal.butter(2,1800,fs=SR,output='sos'),music,axis=0).astype(np.float32)
music=(low+(music-low)*detail_s[:,None])*level_s[:,None]
del low,level_s,detail_s
music=signal.sosfilt(signal.butter(2,35,fs=SR,btype='highpass',output='sos'),music,axis=0).astype(np.float32)
fade_in=np.sin(np.clip(times/.12,0,1)*np.pi/2)**2
fade_out=np.sin(np.clip((duration-times)/2.8,0,1)*np.pi/2)**2
music*=np.minimum(fade_in,fade_out)[:,None].astype(np.float32)
sf.write(work/'music-arranged.wav',music,SR,subtype='PCM_24')
beat_times=np.arange(final_offset,duration,final_period)
beat_record=dict(bpm=60/final_period,quarterPulse_s=final_period,halfTimeVisualPulse_s=2*final_period,
  offset_s=final_offset,beatTimes_s=beat_times.tolist(),beatFrames=[round(x*tl['fps']) for x in beat_times],
  meterStatus='Four-pulse editorial grouping; musical downbeat not independently listening-verified.',
  sourcePulseFitRMS_s=analysis['fitResidualRMS_s'],pitchSemitones=0)
cue_data=read(ROOT/'research/v7-narration-cues.json') if (ROOT/'research/v7-narration-cues.json').exists() else {'clips':[]}
events=[]
for c in cue_data['clips']:
 for cue in c['cues']:
  time=cue['filmStart_s'];near=float(beat_times[np.argmin(abs(beat_times-time))])
  events.append(dict(id=c['id'],phrase=cue['phrase'],voiceCue_s=time,nearestMusicBeat_s=near,
                     nearestMusicBeatFrame=round(near*tl['fps']),offsetFromVoice_s=near-time))
for c in tl['clips']:
 if c['id'] in ['s001','s002','s040','s041','s042','s043','s045']:
  time=c['start']/tl['fps'];near=float(beat_times[np.argmin(abs(beat_times-time))])
  events.append(dict(id=c['id'],phrase='shot start',voiceCue_s=time,nearestMusicBeat_s=near,nearestMusicBeatFrame=round(near*tl['fps']),offsetFromVoice_s=near-time))
save(work/'beat-grid.json',beat_record);save(work/'motion-beat-cues.json',events)
music,premaster,duck=mix.duck_and_mix(music,voice,tl,18.5,np,gaussian_filter1d)
sf.write(work/'music.wav',music,SR,subtype='PCM_24');sf.write(work/'premaster.wav',premaster,SR,subtype='FLOAT')
one_sec=music[:len(music)//SR*SR].reshape(-1,SR,2)
rms_db=20*np.log10(np.maximum(np.sqrt(np.mean(one_sec.astype(np.float64)**2,axis=(1,2))),1e-12))
silent_inner=np.flatnonzero(rms_db[1:-4]<-70)+1
assert len(silent_inner)==0,('Silent interior BGM windows',silent_inner.tolist())
master,aac,normalization=mix.make_master(work/'premaster.wav',work,total,ffmpeg)
wave,rate=sf.read(master,dtype='float32',always_2d=True)
assert rate==SR and len(wave)==total and np.isfinite(wave).all() and max(abs(wave).ravel())<.999
assert sha(source)==analysis['source']['sha256'] and sha(ROOT/'public/timeline.json')==tlsha and sha(ROOT/'public/narration.wav')==vsha
for seam in seams:seam['filmTime_s']=seam['unscaledFilmTime_s']/tempo_factor
record=dict(createdUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='staged_validated',
 source={**analysis['source'],'sourceStatus':'user-provided local file, latest explicit selection superseding The Sixth Axis and earlier references','durationSeconds':original_source_duration,
  'effectiveEndSeconds':len(audio)/SR,'trimmedLowLevelTailSeconds':original_source_duration-len(audio)/SR},
 analysis='audio/feisheng/analysis.json',timelineSHA256=tlsha,narrationSHA256=vsha,durationSeconds=duration,sampleRate=SR,totalSamples=total,
 voiceSpeedFactor=1,subjectiveListeningChecked=False,narrationDraft=bool(tl.get('draft')),musicReplacementPending=False,
 arrangement=dict(originalTrackFormPreserved='Native progression and final cadence preserved; low-level reverb tail shortened.',matchedRepeats=plans,seams=seams,sections=section_events,
  fittedTempoFactor=tempo_factor,pitchSemitones=0,timeFitMethod='FFmpeg rubberband tempo fit, pitch=1',
  exactLengthTailCorrectionSamples=int(delta),musicalRationale='Same-track 8/16-bar recurrences selected by harmonic context, percussion pattern and local level; original final cadence retained; no arbitrary key change or per-chapter tempo jumps. Native rhythmic density and smooth high-frequency-detail automation support chapter pace.',
  soundBalance='35Hz low cut; gentle parallel high-frequency-detail automation; continuous eight-beat chapter envelopes.'),
 beatGrid=beat_record,motionBeatCues=events,ducking=duck,
 musicContinuity=dict(interiorSilentOneSecondWindows=silent_inner.tolist(),minimumInnerRMSDBFS=float(rms_db[1:-4].min()),
  fadeIn_s=.12,fadeOut_s=2.8),masterMeasurement=normalization[-1]['master'],aacMeasurement=normalization[-1]['aac'],
 normalizationAttempts=normalization,hashes={name:sha(work/name) for name in ['music.wav','master.wav','music-arranged.wav','master-aac-check.m4a']})
save(work/'arrangement-report.json',record)
if args.apply:
 backup=work/'previous-production';backup.mkdir()
 for p in [ROOT/'public/music.wav',ROOT/'public/master.wav',ROOT/'research/audio-report.json']:
  if p.exists():shutil.copy2(p,backup/p.name)
 for name in ['music.wav','master.wav']:
  dest=ROOT/'public'/name;pending=dest.with_suffix('.replacement.wav');shutil.copy2(work/name,pending);pending.replace(dest)
 report=dict(title=analysis['source']['title'],artist=analysis['source']['artist'],bpm=beat_record['bpm'],
  durationSeconds=duration,sampleRate=SR,totalSamples=total,voiceSpeedFactor=1,subjectiveListeningChecked=False,narrationDraft=bool(tl.get('draft')),
  masterMeasurement=record['masterMeasurement'],aacMeasurement=record['aacMeasurement'],premasterMeasurement=normalization[-1]['premaster'],
  voiceOverMusicActiveDB=duck['activeVoiceOverMusicDB'],musicReplacementPending=False,
  musicSource='User-selected local recording: 聲無哀樂SWAL — 飞升. The Sixth Axis and the original Douyin reference are superseded by the latest explicit user choice.',
  requestedMusicSource=record['source'],replacementReport=str(work/'arrangement-report.json'),
  hashes={name:sha(ROOT/'public'/name) for name in ['narration.wav','music.wav','master.wav','timeline.json']})
 save(ROOT/'research/audio-report.json',report)
 save(BASE/'current-arrangement.json',dict(directory=str(work),timelineSHA256=tlsha,report=str(work/'arrangement-report.json')))
 for name in ['beat-grid.json','motion-beat-cues.json']:shutil.copy2(work/name,ROOT/'research'/('feisheng-'+name))
 shutil.copy2(work/'master-aac-check.m4a',ROOT/'audio/master-aac-check.m4a')
 mix.run([ffmpeg,'-v','error','-y','-i',ROOT/'public/master.wav','-t',35,'-c:a','pcm_s24le',ROOT/'audio/preview-with-music.wav'])
 record['status']='applied_validated';save(work/'arrangement-report.json',record)
print(json.dumps(dict(status=record['status'],directory=str(work),durationSeconds=duration,bpm=beat_record['bpm'],
 tempoFactor=tempo_factor,pitchSemitones=0,masterLUFS=record['masterMeasurement']['input_i'],aacTruePeak=record['aacMeasurement']['input_tp'],
 silentInnerWindows=len(silent_inner)),ensure_ascii=False),flush=True)
