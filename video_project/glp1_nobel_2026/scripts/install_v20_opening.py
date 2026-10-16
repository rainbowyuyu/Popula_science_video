"""Install the checked opening without moving any camera or narration boundary."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/revision-v20'
patch=json.loads((OUT/'audio/h001-timeline-patch.json').read_text(encoding='utf8'))
report=json.loads((OUT/'audio/audio-report.json').read_text(encoding='utf8'))
assert report['allSamplesAfter9_9SecondsIdentical'] and report['asrNormalizedExact']
assert not report['timeStretch'] and not report['trimmed']
assert hashlib.sha256((ROOT/'public/master-v20.wav').read_bytes()).hexdigest()==report['masterSHA256']
p=ROOT/'src/timeline.json'
original=json.loads(p.read_text(encoding='utf8'))
assert original['revision']=='v18', 'Install only over checked V19 timeline (revision v18).'
shutil.copy2(p,OUT/'timeline-before-v20.json')
timeline=json.loads(p.read_text(encoding='utf8'))
h001=next(c for c in timeline['clips'] if c['id']=='h001')
assert (h001['start'],h001['end'])==(patch['preserveStartFrame'],patch['preserveEndFrame'])
h001.update(patch['setFields'])
timeline['captions']=patch['replaceCaptionsForClip']+[c for c in timeline['captions'] if c['clipId']!='h001']
timeline.update(title='一顿饭后，身体在忙什么？',subtitle='看懂血糖、血压与血脂调节',revision='v20',status='v20-opening-and-packaging-revision')
assert timeline['clips'][1:]==original['clips'][1:]
assert [(c['start'],c['end']) for c in timeline['clips']]==[(c['start'],c['end']) for c in original['clips']]
assert timeline['duration']==26738
p.write_text(json.dumps(timeline,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

voice=ROOT/h001['audioSource']
destination=ROOT/'public'/h001['audio']
destination.parent.mkdir(parents=True,exist_ok=True)
shutil.copy2(voice,destination)
assert hashlib.sha256(destination.read_bytes()).hexdigest()==h001['audioSHA256']

film=ROOT/'src/V5Film.tsx'
code=film.read_text(encoding='utf8')
assert code.count("staticFile('master.wav')")==1
film.write_text(code.replace("staticFile('master.wav')", "staticFile('master-v20.wav')"),encoding='utf8')

def timestamp(f):
    ms=round(f/30*1000)
    h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'

caps=timeline['captions']
srt='\n\n'.join(f'{i+1}\n{timestamp(c["start"])} --> {timestamp(c["end"])}\n{c["text"]}' for i,c in enumerate(caps))+'\n'
(ROOT/'delivery/一顿饭后_身体在忙什么_V20.srt').write_text(srt,encoding='utf8')
(OUT/'install-report.json').write_text(json.dumps({
    'allShotBoundariesUnchanged':True,'clipsAfterH001Unchanged':True,
    'captionsAfterH001Unchanged':True,'durationFrames':26738,
    'changedDisplay': 'h001 title and captions',
    'changedNarration': 'h001 only',
    'master': 'public/master-v20.wav',
    'retainedBaseline': 'delivery/如何科学减肥_从身体调节说起_V19_1080p.mp4',
},ensure_ascii=False,indent=2),encoding='utf8')
print('Installed V20 opening; every shot boundary and all h002–h089 content preserved.')
