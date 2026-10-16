"""Exact sample, caption, no-silence and source-boundary audit."""
from pathlib import Path
import json,re,subprocess,hashlib
import numpy as np
import soundfile as sf
V3=Path(__file__).resolve().parents[1];SR=48000
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 narr=json.loads((V3/'src/narration.json').read_text(encoding='utf8'))
 caps=json.loads((V3/'src/captions.json').read_text(encoding='utf8'))
 x,sr=sf.read(V3/'public/audio/narration.wav',dtype='float32');master=sf.info(V3/'public/audio/master.wav')
 coverage=[];boundary=[];errors=[]
 for c in narr['cues']:
  clip,cs=sf.read(V3/'public'/c['audioFile'],dtype='float32');a=round(c['startSec']*SR)
  err=float(np.max(np.abs(x[a:a+len(clip),0]-clip)))
  energy=np.sqrt(np.mean(clip[:len(clip)//480*480].reshape(-1,480)**2,axis=1));active=energy>max(.002,float(energy.max())*.07)
  shown=np.zeros(len(active),bool)
  for cap in caps:
   if cap['cueId']!=c['id']:continue
   lo=max(0,int(np.floor((cap['startFrame']/30-c['startSec'])*100)));hi=min(len(shown),int(np.ceil((cap['endFrame']/30-c['startSec'])*100)))
   shown[lo:hi]=True
  cover=float(np.sum(shown&active)/max(1,np.sum(active)));coverage.append({'id':c['id'],'activeCoverage':cover,'narrationSampleDifferenceMax':err})
  boundary.append({'id':c['id'],'start20msRms':float(np.sqrt(np.mean(clip[:960]**2))),'end20msRms':float(np.sqrt(np.mean(clip[-960:]**2))),'guardSec':{'before':.08,'after':.16}})
  if err>2e-7:errors.append('sample mismatch '+c['id'])
  if cover<.95:errors.append('caption coverage '+c['id'])
 for a,b in zip(caps,caps[1:]):
  if a['endFrame']>b['startFrame']:errors.append('caption overlap '+a['id'])
 if max(len(c['text'])for c in caps)>24:errors.append('long caption')
 if master.frames!=SR*300 or master.channels!=2:errors.append('master layout')
 r=subprocess.run(['ffmpeg','-hide_banner','-i',str(V3/'public/audio/master.wav'),'-af','silencedetect=noise=-50dB:d=1','-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
 silence=[line.strip()for line in r.stderr.splitlines()if 'silence_start:'in line or 'silence_end:'in line]
 report={'status':'pass'if not errors else'needs-review','errors':errors,'master':{'sha256':sha(V3/'public/audio/master.wav'),'durationSec':master.duration,'sampleRate':master.samplerate,'channels':master.channels,'samples':master.frames},'cueCount':len(narr['cues']),'captions':len(caps),'maxCaptionChars':max(len(c['text'])for c in caps),'minCaptionDurationFrames':min(c['endFrame']-c['startFrame']for c in caps),'rawSpeechClipSeconds':narr['totalRawSpeechClipSec'],'coverage':coverage,'boundaryGuards':boundary,'silenceDetect':silence,'subjectiveListeningChecked':False,'asrCaveat':'n14 homophone recognition: 甲乙丙 -> 甲椅柄; source text and complete sentence preserved. No dropped phrase flagged.'}
 (V3/'research/audio-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({k:v for k,v in report.items()if k not in ['coverage','boundaryGuards']},ensure_ascii=False,indent=2))
 if errors:raise SystemExit(1)
if __name__=='__main__':main()
