"""Select screened natural takes without moving any existing video boundary."""
from pathlib import Path
import shutil
import numpy as np
import soundfile as sf
from voice import ROOT,read,save,sha

selections=[('g011','pronunciation-v2',5.24),('g042','pronunciation-v3',None)]
report=[]
for sid,candidate,trim in selections:
    d=read(ROOT/'audio/candidates'/candidate/f'{sid}.json');source=ROOT/d['processed']
    oldpath=ROOT/'audio/takes'/f'{sid}.json';old=read(oldpath)
    archive=ROOT/'audio/selected-prior';archive.mkdir(exist_ok=True)
    if not (archive/f'{sid}.json').exists():
        save(archive/f'{sid}.json',old);shutil.copy2(ROOT/old['processed'],archive/f'{sid}.wav')
    dest=ROOT/'public/voice'/f'{sid}.wav';w,sr=sf.read(source,dtype='float64')
    edit=None
    if trim is not None:
        end=round(trim*sr);removed=w[end:]
        block=round(.02*sr);a=removed[:len(removed)//block*block].reshape(-1,block)
        maxrms=float(20*np.log10(max(np.sqrt(np.mean(a*a,axis=1)).max(),1e-12)))
        peak=float(20*np.log10(max(abs(removed).max(),1e-12)))
        assert maxrms<-58 and peak<-50
        # Only the measured quiet generated tail is omitted. All raw and full
        # mastered candidates remain retained; no speech/breath is speeded up.
        w=w[:end];fade=round(.008*sr);w[-fade:]*=np.linspace(1,0,fade)
        edit=dict(trimmedTrailingQuietSeconds=len(removed)/sr,removedPeakDBFS=peak,
            removedMaximum20msRmsDBFS=maxrms,rawRetained=True,fullMasteredCandidateRetained=True,
            reason='Quiet tail beyond the complete spoken phrase; maintains original visual slot',speedFactor=1)
    sf.write(dest,w,sr,subtype='PCM_24')
    d.update(processed=dest.relative_to(ROOT).as_posix(),duration=len(w)/sr,sha256=sha(dest),selectedCandidate=candidate,
             fullMasteredCandidate=source.relative_to(ROOT).as_posix(),tailEdit=edit)
    save(oldpath,d);report.append(dict(id=sid,candidate=candidate,seconds=len(w)/sr,tailEdit=edit,
        correctedTerm='肠促胰素' if sid=='g011' else '长回→口播涨回（zhǎng）',subjectiveListeningChecked=False))
save(ROOT/'research/pronunciation-selection.json',dict(selections=report,unchangedVideoSlots=True,voiceSpeedFactor=1))
print('Selected pronunciation takes; no video timing changed')
