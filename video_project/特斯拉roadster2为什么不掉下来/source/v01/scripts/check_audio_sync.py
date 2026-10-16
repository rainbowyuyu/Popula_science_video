"""Check rendered audio timing against the generated narration, not a listening substitute."""
from pathlib import Path
import json,subprocess,sys
import numpy as np
import soundfile as sf
from scipy.signal import correlate,correlation_lags
ROOT=Path(__file__).resolve().parents[3]
version=sys.argv[1] if len(sys.argv)>1 else 'v01'
OUT=ROOT/'work/v01/checks'/version;OUT.mkdir(parents=True,exist_ok=True)
video=ROOT/f'output/v01/roadster-mechanism-preview-{version}.mp4'
wave=OUT/'decoded-final.wav'
if not wave.exists():
    subprocess.run(['ffmpeg','-v','error','-n','-i',str(video),'-vn','-ac','1','-ar','48000','-c:a','pcm_s24le',str(wave)],check=True)
final,sr=sf.read(wave);original,sr0=sf.read(ROOT/'audio/v01/preview-narration.wav');assert sr==sr0==48000
stride=8;x=original[::stride];y=final[::stride]
corr=correlate(y,x,mode='full',method='fft');lags=correlation_lags(len(y),len(x));mask=np.abs(lags)<=.12*sr/stride
lag=int(lags[mask][np.argmax(corr[mask])]*stride)
xstart=max(0,-lag);ystart=max(0,lag);n=min(len(original)-xstart,len(final)-ystart)
a=original[xstart:xstart+n];b=final[ystart:ystart+n]
similarity=float(np.dot(a,b)/np.sqrt(np.dot(a,a)*np.dot(b,b)))
timeline=json.loads((ROOT/'source/v01/timeline-preview.json').read_text(encoding='utf-8'));segments=[]
for scene in timeline['scenes']:
    clean,_=sf.read(ROOT/f'audio/v01/{scene["id"]}-clean.wav');start=scene['from']*1600
    delta=float(np.max(np.abs(clean-original[start:start+len(clean)])))
    segments.append({'id':scene['id'],'completeCleanClipInNarration':delta<2e-7,'maxSampleDifference':delta,'sceneStartSample':start,'cleanSamples':len(clean)})
report={'sampleRate':sr,'narrationSamples':len(original),'decodedSamples':len(final),'aacTrailingPaddingSamples':len(final)-len(original),'measuredLagSamples':lag,'measuredLagMs':1000*lag/sr,'waveformCosineAfterAlignment':similarity,'withinOneVideoFrame':abs(lag)<1600,'completeSentenceChecks':segments,'subjectiveListeningChecked':False,'subtitleWordAlignmentVerified':False}
(OUT/'audio-sync.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
