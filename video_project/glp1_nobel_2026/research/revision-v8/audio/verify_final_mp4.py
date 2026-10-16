"""Read-only waveform validation of the final encoded AAC against the frozen V8 master.

Usage: python research/revision-v8/audio/verify_final_mp4.py --video PATH
The timing conclusion comes from decoded waveform matching, not stream timestamps.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,math,re,subprocess,tempfile,sys
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly,correlate

WORK=Path(__file__).resolve().parent;ROOT=WORK.parents[2]
SR=48000;CHECK_SR=8000
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf8'))
def run(args):
 p=subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace')
 if p.returncode:raise RuntimeError('Command failed: '+str(args[0])+'\n'+p.stderr[-5000:])
 return p
def loudness(video):
 result=run(['ffmpeg','-hide_banner','-nostdin','-i',str(video),'-map','0:a:0','-vn','-af','loudnorm=I=-15:TP=-2:LRA=11:print_format=json','-f','null','-'])
 blocks=re.findall(r'\{\s*"input_i"[\s\S]*?\}',result.stderr)
 if len(blocks)!=1:raise RuntimeError('No unique loudnorm input measurement returned')
 raw=json.loads(blocks[0]);return {'integratedLUFS':float(raw['input_i']),'truePeakDBTP':float(raw['input_tp']),'loudnessRangeLU':float(raw['input_lra']),'thresholdLUFS':float(raw['input_thresh']),'measurement':'ffmpeg loudnorm input measurement on final encoded audio','raw':raw}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--video',required=True);ap.add_argument('--out',default=str(WORK/'final-mp4-check'));ap.add_argument('--max-true-peak',type=float,default=-1.0);ap.add_argument('--min-correlation',type=float,default=.97);args=ap.parse_args()
 video=Path(args.video).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
 report_path=out/'verification.json'
 if report_path.exists():raise RuntimeError('Use a fresh report directory; existing verification must remain reviewable')
 if not video.is_file():raise FileNotFoundError(video)
 candidate=read(WORK/'music-final/audio-candidate-report.json');master=WORK/'music-final/master.wav'
 expected_master=candidate['hashes']['master.wav'];master_sha=sha(master)
 if master_sha!=expected_master:raise RuntimeError('Frozen V8 master changed')
 protected=candidate['lockedStagedInputs']
 if (WORK/'installation.json').exists():protected.update(read(WORK/'installation.json')['protectedFilesAfter'])
 if any(sha(ROOT/p)!=h for p,h in protected.items()):raise RuntimeError('Frozen V8 narration/story/timeline changed')
 timeline=read(WORK/'staged/timeline.json');expected_n=timeline['durationFrames']*1600
 video_sha=sha(video)
 probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]).stdout)
 audio_streams=[s for s in probe['streams'] if s['codec_type']=='audio']
 if len(audio_streams)!=1:raise RuntimeError('Expected exactly one final soundtrack')
 stream=audio_streams[0]
 if stream['codec_name']!='aac' or int(stream['sample_rate'])!=SR or stream['channels']!=2:raise RuntimeError('Expected 48 kHz stereo AAC soundtrack')
 fd,tmpname=tempfile.mkstemp(prefix='decoded-final-',suffix='.f32',dir=out)
 import os
 os.close(fd);tmp=Path(tmpname)
 try:
  # Decode without a guessed delay correction, offset, trim, apad or atempo.
  run(['ffmpeg','-hide_banner','-nostdin','-v','error','-xerror','-y','-i',str(video),'-map','0:a:0','-vn','-ar',str(SR),'-ac','2','-f','f32le',str(tmp)])
  if tmp.stat().st_size%8:raise RuntimeError('Incomplete stereo PCM frame')
  decoded_n=tmp.stat().st_size//8;delta=decoded_n-expected_n
  # AAC is block-coded; a muxer may retain <= one silent encoder tail block.
  if not 0<=delta<=1023:raise RuntimeError(f'Decoded length differs beyond AAC tail padding: {delta} samples')
  decoded=np.memmap(tmp,dtype='<f4',mode='r',shape=(decoded_n,2))
  expected8=[];actual8=[];xx=yy=xy=0.;finite=True;maxpeak=0.;count=0;block=20*SR
  with sf.SoundFile(master) as reference:
   if reference.samplerate!=SR or reference.channels!=2 or len(reference)!=expected_n:raise RuntimeError('Master format or length does not match frozen timeline')
   for start in range(0,expected_n,block):
    x=reference.read(min(block,expected_n-start),dtype='float64',always_2d=True)
    y=np.asarray(decoded[start:start+len(x)],dtype='float64')
    finite=finite and bool(np.isfinite(y).all());maxpeak=max(maxpeak,float(np.max(np.abs(y))));count+=len(y)
    xx+=float(np.sum(x*x));yy+=float(np.sum(y*y));xy+=float(np.sum(x*y))
    expected8.append(resample_poly(x.mean(axis=1),1,6));actual8.append(resample_poly(y.mean(axis=1),1,6))
  tail_peak=float(np.max(np.abs(decoded[expected_n:]))) if delta else 0.
  del decoded
  x8=np.concatenate(expected8);y8=np.concatenate(actual8);pad=round(.25*CHECK_SR);padded=np.pad(y8,(pad,pad));checks=[]
  for start in range(0,len(x8),5*CHECK_SR):
   end=min(start+5*CHECK_SR,len(x8));x=x8[start:end];y=padded[start:end+2*pad]
   energy=float(x@x);rms=math.sqrt(energy/max(1,len(x)));aligned=y[pad:pad+len(x)];actual_energy=float(aligned@aligned);actual_rms=math.sqrt(actual_energy/max(1,len(x)))
   entry={'startSeconds':start/CHECK_SR,'durationSeconds':len(x)/CHECK_SR,'referenceRMSDBFS':20*math.log10(max(rms,1e-12)),'actualRMSDBFS':20*math.log10(max(actual_rms,1e-12))}
   if rms<1e-6 and actual_rms<1e-6:
    entry.update({'status':'uninformative-near-silence','sampleCount':len(x),'reason':'Both reference and actual RMS are below -120 dBFS; no useful timing evidence.'});checks.append(entry);continue
   cross=correlate(y,x,mode='valid',method='fft');power=np.r_[0.,np.cumsum(y*y,dtype='float64')]
   candidate_energy=power[len(x):]-power[:-len(x)]
   # Cumulative subtraction can lose the energy of an almost-silent candidate.
   # Recompute its energy AND dot product directly, then reject candidates over
   # 60 dB quieter than the reference as lacking comparable timing evidence.
   # In particular, do not amplify FFT roundoff by an artificial denominator
   # floor and do not clamp impossible coefficients to 1.
   minimum_candidate_energy=max(energy*1e-6,len(x)*1e-24)
   weak=np.flatnonzero(candidate_energy<=minimum_candidate_energy)
   for k in weak:
    segment=y[k:k+len(x)];candidate_energy[k]=float(segment@segment);cross[k]=float(segment@x)
   valid=candidate_energy>minimum_candidate_energy
   score=np.full(len(cross),-np.inf,dtype=np.float64)
   score[valid]=cross[valid]/np.sqrt(candidate_energy[valid]*energy)
   for k in np.flatnonzero(valid & (score>1+1e-8)):
    segment=y[k:k+len(x)];candidate_energy[k]=float(segment@segment);cross[k]=float(segment@x);score[k]=cross[k]/math.sqrt(candidate_energy[k]*energy)
   if valid.any() and float(np.max(score[valid]))>1+1e-8:raise RuntimeError('Correlation still violates Cauchy-Schwarz after direct recomputation')
   if not valid.any():
    entry.update({'status':'mismatch','bestLagSamples8kHz':None,'bestLagMilliseconds':None,'zeroLagCorrelation':0.,'bestCorrelation':0.,'reason':'Reference has energy but no actual lag candidate has comparable energy.'});checks.append(entry);continue
   best=int(np.argmax(score))-pad;zero_score=float(score[pad]) if valid[pad] else 0.
   entry.update({'status':'matched' if best==0 and zero_score>=args.min_correlation else 'mismatch','bestLagSamples8kHz':best,'bestLagMilliseconds':best/CHECK_SR*1000,'zeroLagCorrelation':zero_score,'bestCorrelation':float(score.max()),'lagCandidatesRecomputedDirectly':len(weak),'lagCandidatesWithoutComparableEnergy':int((~valid).sum()),'minimumLagCandidateEnergyRelativeToReference':1e-6});checks.append(entry)
  matched=[c for c in checks if c['status']!='uninformative-near-silence']
  timing_ok=bool(matched) and all(c['bestLagSamples8kHz']==0 for c in matched)
  content_ok=bool(matched) and all(c['zeroLagCorrelation']>=args.min_correlation for c in matched)
  measurement=loudness(video)
  loudness_ok=-16<=measurement['integratedLUFS']<=-14 and measurement['truePeakDBTP']<=args.max_true_peak
  unchanged=sha(master)==master_sha and sha(video)==video_sha and all(sha(ROOT/p)==h for p,h in protected.items())
  gain=xy/xx;residual=math.sqrt(max(0.,yy-2*gain*xy+gain*gain*xx)/max(yy,1e-30))
  success=finite and count==expected_n and timing_ok and content_ok and loudness_ok and unchanged
  report={'schema':'rainbow.v8.final-aac-waveform-check.v2','createdUTC':datetime.now(timezone.utc).isoformat(),'passed':bool(success),'video':str(video),'videoSHA256':video_sha,'master':str(master),'masterSHA256':master_sha,'expectedSamples48kHz':expected_n,'decodedSamples48kHz':decoded_n,'aacTailPaddingSamples':delta,'aacTailPeakDBFS':20*math.log10(max(tail_peak,1e-12)),'finiteSamples':finite,'samplePeakDBFS':20*math.log10(max(maxpeak,1e-12)),'fullZeroLagCorrelation':xy/math.sqrt(xx*yy),'fittedGlobalGainDB':20*math.log10(gain),'normalizedResidualAfterGlobalGain':residual,'waveformTimingVerified':timing_ok,'waveformContentVerified':content_ok,'windowSizeSeconds':5,'windowStrideSeconds':5,'lagSearchMilliseconds':[-250,250],'timingResolutionMilliseconds':1000/CHECK_SR,'correlationEnergyPolicy':'Record both RMS values; directly recompute low-energy candidate power and cross products; discard lag candidates >60 dB below reference energy; never clamp coefficients. Only both-window RMS below -120 dBFS is uninformative.','everyFiveSecondWindowLagSearch':checks,'informativeWindowCount':len(matched),'silentWindowCount':len(checks)-len(matched),'loudness':measurement,'loudnessGuard':{'integratedLUFS':[-16,-14],'truePeakCeilingDBTP':args.max_true_peak},'loudnessGuardPassed':loudness_ok,'inputsUnchanged':unchanged,'streamMetadataSupplementOnly':stream,'subjectiveListeningCompleted':False,'limitations':['Synchronization conclusion is decoded-waveform matching at 0.125 ms search resolution; not based only on stream metadata.','AAC is lossy and is not expected to match PCM samples exactly.','No subjective music listening or aesthetic approval is implied.','Silent windows do not carry timing evidence and are listed separately.']}
  report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  print(json.dumps({'passed':success,'informativeWindows':len(matched),'allBestLagZero':timing_ok,'minimumWindowCorrelation':min(c['zeroLagCorrelation'] for c in matched),'integratedLUFS':measurement['integratedLUFS'],'truePeakDBTP':measurement['truePeakDBTP'],'decodedMinusMasterSamples':delta,'report':str(report_path)},ensure_ascii=False))
  if not success:return 1
  return 0
 finally:
  # Only this exact tool-created scratch file is removed; source media stay intact.
  if tmp.exists():tmp.unlink()
if __name__=='__main__':sys.exit(main())
