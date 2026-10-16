"""Verify a finished video's actual AAC against the selected master and music tail."""
from pathlib import Path
import argparse,json,math
import numpy as np
import soundfile as sf
from scipy import signal
import replace_requested_music as audio

ROOT=Path(__file__).resolve().parents[1];SR=48000
ap=argparse.ArgumentParser()
ap.add_argument('--video',required=True,type=Path)
ap.add_argument('--out',required=True,type=Path)
args=ap.parse_args()
video=args.video.resolve(strict=True);out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
tl=audio.read(ROOT/'public/timeline.json');mix=audio.read(ROOT/'research/audio-report.json')
assert not tl.get('draft') and not tl.get('pendingNarrationClips'),'Final narration is not locked'
assert not mix.get('musicReplacementPending'),'Latest user-selected music is not applied'
source=mix['requestedMusicSource'];assert source['title']=='飞升' and source['artist']=='聲無哀樂SWAL'
assert audio.digest(Path(source['path']))==source['sha256']
timeline_sha=audio.digest(ROOT/'public/timeline.json')
master_sha=audio.digest(ROOT/'public/master.wav');music_sha=audio.digest(ROOT/'public/music.wav')
assert master_sha==mix['hashes']['master.wav'] and music_sha==mix['hashes']['music.wav']
assert timeline_sha==mix['hashes']['timeline.json']
beats=audio.read(ROOT/'src/camera-beats.json')
assert beats['timelineFrames']==tl['duration'] and beats['musicSHA256']==music_sha
ffmpeg=audio.executable('ffmpeg');ffprobe=audio.executable('ffprobe')
meta=audio.probe(video,ffprobe)
streams=[s for s in meta['streams'] if s['codec_type']=='audio'];assert len(streams)==1
stream=streams[0];assert stream['codec_name']=='aac'
assert int(stream['sample_rate'])==SR and stream['channels']==2
duration=tl['duration']/tl['fps'];assert abs(float(stream['duration'])-duration)<.1
decoded_path=out/'decoded-final-audio.wav'
audio.run([ffmpeg,'-v','error','-y','-i',video,'-map','0:a:0','-vn','-ar',SR,'-ac',2,'-c:a','pcm_s24le',decoded_path])
decoded,rate=sf.read(decoded_path,dtype='float32',always_2d=True)
master,mrate=sf.read(ROOT/'public/master.wav',dtype='float32',always_2d=True)
assert rate==mrate==SR and len(master)==tl['duration']*1600
assert abs(len(decoded)-len(master))<=round(.1*SR)
assert np.isfinite(decoded).all() and np.max(np.abs(decoded))<1

# Determine encoder alignment rather than assuming a zero AAC priming delay.
n=min(30*SR,len(master),len(decoded))
x=master[:n].mean(axis=1);y=decoded[:n].mean(axis=1)
corr=signal.correlate(y[::4],x[::4],method='fft')
lags=signal.correlation_lags(len(y[::4]),len(x[::4]))
window=np.abs(lags)<=512;coarse=int(lags[window][np.argmax(corr[window])])*4
def align(reference,observed,lag):
 a=max(0,-lag);b=max(0,lag);count=min(len(reference)-a,len(observed)-b)
 return reference[a:a+count],observed[b:b+count]
scores=[]
for lag in range(coarse-4,coarse+5):
 a,b=align(x,y,lag);scores.append((float(np.dot(a.astype(np.float64),b.astype(np.float64))),lag))
lag=max(scores)[1];assert abs(lag)<=2048
ref,wave=align(master,decoded,lag)
def compare(a,b):
 a=a.astype(np.float64);b=b.astype(np.float64)
 aa=float(np.sum(a*a));bb=float(np.sum(b*b));ab=float(np.sum(a*b))
 assert aa>1e-9 and bb>1e-9
 return dict(correlation=ab/math.sqrt(aa*bb),relativeRMSError=math.sqrt(float(np.sum((a-b)**2))/aa),
             relativeLevelDB=10*math.log10(bb/aa),samplePairs=a.size)

windows=[]
for start in [0,duration*.25,duration*.5,duration*.75]:
 a=round(start*SR);b=min(len(ref),a+12*SR)
 windows.append(dict(start_s=start,end_s=b/SR,**compare(ref[a:b],wave[a:b])))
# The reference tail contains no narration, so matching it verifies that the
# actual encoded video used the newly selected music, not a similar voice mix.
a=round((tl['outro']['start']/tl['fps']+.2)*SR)
b=min(len(ref),round((duration-1.5)*SR))
tail=compare(ref[a:b],wave[a:b]);tail.update(start_s=a/SR,end_s=b/SR)
assert all(w['correlation']>.98 and w['relativeRMSError']<.12 for w in windows),windows
assert tail['correlation']>.985 and tail['relativeRMSError']<.12,tail
level=audio.loudness(video,ffmpeg)
assert -16<=float(level['input_i'])<=-14 and float(level['input_tp'])<=-1
assert audio.digest(ROOT/'public/master.wav')==master_sha and audio.digest(ROOT/'public/music.wav')==music_sha
assert audio.digest(ROOT/'public/timeline.json')==timeline_sha
report=dict(passed=True,video=str(video),videoSHA256=audio.digest(video),timelineSHA256=timeline_sha,
 timelineFrames=tl['duration'],expectedDurationSeconds=duration,audioCodec=stream['codec_name'],
 streamDurationSeconds=float(stream['duration']),decodedSamples=len(decoded),sampleRate=SR,channels=2,
 selectedMasterSHA256=master_sha,selectedMusicSHA256=music_sha,selectedSource=source,
 measuredAAC=level,encoderAlignmentSamples=lag,matchedWindows=windows,musicOnlyTailMatch=tail,
 subjectiveListeningChecked=False,pronunciationListeningVerified=False,
 scope='Actual delivered AAC decoded and compared to selected master at four speech windows and its narration-free music tail. This verifies track/timing/master identity and objective signal checks, not subjective listening.')
audio.save(out/'audio-wave-match.json',report)
print(json.dumps(dict(passed=True,video=str(video),aacLUFS=level['input_i'],aacTruePeakDBTP=level['input_tp'],
 encoderAlignmentSamples=lag,musicTailCorrelation=tail['correlation'],report=str(out/'audio-wave-match.json')),ensure_ascii=False),flush=True)
