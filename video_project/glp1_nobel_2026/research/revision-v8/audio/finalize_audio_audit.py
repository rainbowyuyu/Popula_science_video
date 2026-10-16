"""Record V8 provenance, safe boundaries, exact sample placement, and A/B assets."""
from pathlib import Path
import json,hashlib,subprocess
import numpy as np
import soundfile as sf
from audit_sources import metrics,wave
BASE=Path(__file__).resolve().parent;ROOT=BASE.parents[2]
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def main():
 staged=BASE/'staged';selected=read(staged/'selected-takes.json');tl=read(staged/'timeline.json');place=read(staged/'placements.json');selection=read(BASE/'selected-parts.json')
 parts=[]
 for t in selected['takes']:
  assert sha(t['processed'])==t['sha256']
  for p in t.get('parts',[]):
   assert sha(p['raw'])==p['rawSHA256'] and sha(p['guardedSource'])==p['guardedSHA256'] and sha(p['processed'])==p['sha256']
   raw=wave(Path(p['raw']));guarded=wave(Path(p['guardedSource']));processed=wave(Path(p['processed']))
   assert len(raw)+11520==len(guarded)==len(processed)
   assert np.max(np.abs(guarded[3840:3840+len(raw)]-raw))<1e-6
   q=metrics(processed);parts.append({'id':p['id'],'partIndex':p['partIndex'],'sourceTailMs':p['rawMetrics']['lastActiveToEndMs'],'sourceTail20msDBFS':p['rawMetrics']['last20msDBFS'],'sourceHeadMs':p['rawMetrics']['firstActiveMs'],'processedTail20msDBFS':q['last20msDBFS'],'processingDelayCompensatedSamples':p['processing']['measuredLatencySamples'],'processedSamples':len(processed),'rawSamples48k':len(raw),'guardsSeconds':[.08,.16],'rawSHA256':p['rawSHA256'],'processedSHA256':p['sha256'],'fullLengthPreserved':True,'clippedSamples':q['clippedSamples']})
 assert all(p['clippedSamples']==0 and p['sourceTailMs']>=59.99 for p in parts)
 previews=[]
 for sid in ['h006','h026','h027','h077']:
  take=next(t for t in selected['takes'] if t['id']==sid)
  raw=BASE/f'AB-{sid}-raw-full-guarded.wav';clean=BASE/f'AB-{sid}-processed.wav'
  audio=np.concatenate([wave(Path(p['guardedSource'])) for p in take['parts']]);sf.write(raw,audio,48000,subtype='PCM_24')
  # Comparison copies use the same integrated loudness, without modifying takes.
  for source,dest in [(raw,BASE/f'AB-{sid}-raw-matched.wav'),(Path(take['processed']),clean)]:
   subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-af','loudnorm=I=-19:TP=-2:LRA=11','-ar','48000','-c:a','pcm_s24le',str(dest)],check=True)
  raw.unlink()
  previews.append({'id':sid,'rawLoudnessMatched':str(BASE/f'AB-{sid}-raw-matched.wav'),'processedLoudnessMatched':str(clean),'subjectiveListeningChecked':False})
 report={'storySHA256':tl['storySHA256'],'timelineSHA256':sha(staged/'timeline.json'),'durationFrames':tl['durationFrames'],'durationSeconds':tl['durationSeconds'],'sentenceCount':len(tl['clips']),'changedSentenceCount':selected['changedSentenceCount'],'changedSentenceIds':list(selection['sentences']),'selectedFragmentCount':len(parts),'sourceAndProcessingVerification':parts,'allFullNarrationSourcePlacementsExact':place['allSourcePCMPlacementsExact'],'narrationSHA256':sha(staged/'narration.wav'),'captionCount':len(tl['captions']),'captionWarnings':read(staged/'caption-warnings.json'),'additionalMedicalCandidateDecision':selection['additionalMedicalCandidateDecision'],'ABPreviews':previews,'subjectiveListeningChecked':False,'limits':['ASR was unprompted and without VAD. It screens coverage and assists timing; it does not certify tone quality or pleasantness.','A final encoded MP4 recheck is still needed.','Remaining unselected medical candidates and their ASR are preserved for comparison.'],'fullVoiceSpeedFactor':1,'originalSourceTakesWereNotOverwritten':True}
 save(BASE/'voice-selection-audit.json',report)
 print(json.dumps({'changed':report['changedSentenceCount'],'fragments':len(parts),'minimumRawTailMs':min(p['sourceTailMs'] for p in parts),'captionWarnings':len(report['captionWarnings']),'allSourcePlacementsExact':True},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
