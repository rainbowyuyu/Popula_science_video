from pathlib import Path
import json,hashlib,subprocess,math
import numpy as np,soundfile as sf
R=Path(__file__).resolve().parents[1];A=R/'public/audio';Q=R/'research/audio';tl=json.loads((R/'src/timeline.json').read_text(encoding='utf8'));x,sr=sf.read(A/'rainbow-arc-master.wav',dtype='float64',always_2d=True);n,ns=sf.read(A/'narration.wav');music,ms=sf.read(A/'music-bed.wav',always_2d=True)
assert sr==ns==ms==48000;assert len(x)==len(music)==round(tl['duration']/tl['fps']*sr);assert np.isfinite(x).all();assert np.max(np.abs(x))<1
# Reconstruct the narration from all 50 authored clips and exact 100ms gaps.
parts=[]
for i,c in enumerate(tl['clips']):
 y,ys=sf.read(R/c['audio']);assert ys==sr
 if i:parts.append(np.zeros(4800))
 parts.append(y)
rebuild=np.concatenate(parts);assert len(rebuild)==len(n);diff=float(np.max(np.abs(rebuild-n)));assert diff<1e-6
out=subprocess.run(['ffmpeg','-hide_banner','-i',str(A/'rainbow-arc-master.wav'),'-af','loudnorm=I=-15:TP=-1.5:LRA=9:print_format=json','-f','null','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',errors='replace',check=True).stderr;meter=json.loads(out[out.rfind('{'):out.rfind('}')+1]);report={'completeDecodePassed':True,'seconds':len(x)/sr,'sampleRate':sr,'channels':x.shape[1],'narrationPCMAssemblyMaximumDifference':diff,'narrationClips':len(tl['clips']),'narrationSamples':len(n),'referenceSilenceSeconds':(len(x)-len(n))/sr,'loudnessLUFS':float(meter['input_i']),'truePeakDBTP':float(meter['input_tp']),'loudnessPass':-16<=float(meter['input_i'])<=-14,'truePeakPass':float(meter['input_tp'])<=-1,'masterSHA256':hashlib.sha256((A/'rainbow-arc-master.wav').read_bytes()).hexdigest(),'subjectiveFullListening':False,'captionCount':len(tl['captions']),'maxCaptionChars':max(len(c['text']) for c in tl['captions']),'noTimeStretch':True};(Q/'audio-integrity.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');mix=json.loads((Q/'mix-report.json').read_text(encoding='utf8'));mix['fullDecodeCheck']=True;mix['finalMeasuredLoudness']=meter;(Q/'mix-report.json').write_text(json.dumps(mix,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
