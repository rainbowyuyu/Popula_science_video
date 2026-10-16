"""Read candidate stems; exact candidate hashes and seam metrics for parent install."""
from pathlib import Path
import json,hashlib,math
from datetime import datetime,timezone
import numpy as np
import soundfile as sf
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(2**20),b''):h.update(b)
    return h.hexdigest()
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def main():
    report=read(OUT/'audio-report.json');timeline=read(OUT/'timeline.json');n=timeline['durationFrames']*1600
    assert report['h002AndLaterNarrationSampleIdentical'] and report['voiceSpeedFactor']==1
    assert float(report['aacMeasurement']['input_tp'])<=-1
    assert -16<=float(report['aacMeasurement']['input_i'])<=-14
    formats=[]
    for name,channels in [('master.wav',2),('music.wav',2),('narration.wav',1)]:
        info=sf.info(OUT/name);assert info.frames==n and info.samplerate==48000 and info.channels==channels
        formats.append(dict(name=name,samples=info.frames,sampleRate=info.samplerate,channels=info.channels,sha256=sha(OUT/name)))
    seams=[]
    with sf.SoundFile(OUT/'music.wav') as reader:
        for transition in report['phraseSegments']+[{'transitionOutputSeconds':report['coda']['outputStartSeconds'],'crossfadeSeconds':3.4}]:
            t=transition['transitionOutputSeconds'];width=transition['crossfadeSeconds']
            reader.seek(round((t-1)*48000));w=reader.read(round((width+2)*48000),dtype='float64',always_2d=True)
            diff=np.max(np.abs(np.diff(w,axis=0)),axis=1)
            center=48000;local=diff[center-4:center+4]
            seams.append(dict(time=t,crossfadeSeconds=width,maxAdjacentSampleJump=float(diff.max()),
                jumpAtSeam=float(local.max()),maxPeak=float(np.max(np.abs(w))),finite=bool(np.isfinite(w).all()),
                note='Numerical discontinuity metric only; does not replace musical listening'))
    pairs=[('story-v5.json','docs/story-v5.json'),('timeline.json','src/timeline.json'),('timeline.json','public/timeline.json'),
           ('master.wav','public/master.wav'),('narration.wav','public/narration.wav'),('music.wav','public/music.wav'),
           ('opening/c/h001.wav','public/voice/h001.wav'),('GLP1-v5-subtitles.srt','delivery/GLP1-v5-subtitles.srt')]
    manifest=dict(readyForParentInstallation=True,installed=False,createdAtUTC=datetime.now(timezone.utc).isoformat(),
        title=timeline['title'],frames=timeline['durationFrames'],durationSeconds=timeline['durationSeconds'],
        files=[dict(source=(OUT/s).relative_to(ROOT).as_posix(),destination=d,sha256=sha(OUT/s)) for s,d in pairs],
        reportSHA256=sha(OUT/'audio-report.json'),formats=formats,seamMetrics=seams,
        storySHA256=sha(OUT/'story-v5.json'),timelineSHA256=sha(OUT/'timeline.json'),masterSHA256=sha(OUT/'master.wav'),
        h002AndLaterAudioCaptionsTimingUnchanged=True,priorPolyphoneRepairsRetained=True,
        subjectiveListeningChecked=False,
        installationNotes=['All candidate files are under the authorized isolated research folder; this tool installs nothing.',
            'Parent must replace source lock and validation expected hashes, and refresh formal delivery narration/subtitles from this candidate timeline.',
            'audio/revision-v5 is the previous locked audio set; preserve as baseline or create a new canonical copy if needed. Candidate timeline h001 audioSource deliberately points to opening/c/h001.wav.',
            'Previous audio/report files referencing original soundtrack 餐后晴光 are historical and should not label this new output.'])
    save(OUT/'candidate-install-manifest.json',manifest)
    print(json.dumps({k:manifest[k] for k in ['storySHA256','timelineSHA256','masterSHA256','frames','durationSeconds']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
