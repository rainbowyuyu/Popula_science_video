"""Bind the new complete take to display captions without moving shot slots."""
from pathlib import Path
import json, hashlib, shutil

ROOT = Path(__file__).resolve().parents[1]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p, value): p.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf8')

tl = json.loads((ROOT/'src/timeline.json').read_text('utf8'))
clip = next(c for c in tl['clips'] if c['id']=='h077')
display = '如果突然嘴歪、说不清话、一侧胳膊没力，要立即拨打急救电话，120。急症来时，不能等吃点药、睡一觉再看看。'
clip['text'] = clip['caption'] = display
asr_path = ROOT/'research/revision-v10/audio/asr-h077.json'
captions = []
for i, (text, start, end) in enumerate([
    ('如果突然嘴歪、说不清话、一侧胳膊没力，', 0., 3.82),
    ('要立即拨打急救电话，120。', 3.98, 6.58),
    ('急症来时，', 6.76, 7.46),
    ('不能等吃点药、睡一觉再看看。', 7.46, 9.94),
]):
    captions.append(dict(id=f'h077-c{i+1}', clipId='h077', text=text,
        start=clip['start']+round(start*30), end=clip['start']+round(end*30),
        sourceSHA256=clip['audioSHA256'], asrCacheKey=sha(asr_path),
        timingSource='V18 unprompted no-VAD Whisper word timing with short readable sentence-end hold'))
tl['captions']=sorted([c for c in tl['captions'] if c['clipId']!='h077']+captions,key=lambda c:c['start'])
assert ''.join(c['text'] for c in captions)==clip['caption']
storypath=ROOT/'docs/story-v10.json'
story=json.loads(storypath.read_text('utf8')); story['revision']='v18'
for row in story['shots']:
    current=next(c for c in tl['clips'] if c['id']==row['id'])
    for key in ['text','caption','ttsText','note']:
        if key in current: row[key]=current[key]
write(storypath,story)
tl['storySHA256']=sha(storypath)
write(ROOT/'src/timeline.json',tl)
shutil.copy2(ROOT/'src/timeline.json',ROOT/'public/timeline.json')
takepath=ROOT/'research/revision-v10/audio/takes/h077.json'
take=json.loads(takepath.read_text('utf8'));take.update(text=display,storySHA256=sha(storypath))
write(takepath,take)
clip['takeSHA256']=sha(takepath)
write(ROOT/'src/timeline.json',tl);shutil.copy2(ROOT/'src/timeline.json',ROOT/'public/timeline.json')
report_path=ROOT/'research/revision-v10/audio/v18-audio-report.json'
report=json.loads(report_path.read_text('utf8'));report.update(storySHA256=sha(storypath),timelineSHA256=sha(ROOT/'src/timeline.json'),h077Take=take)
report['captionRevision']='Display order follows the new utterance, measured word timing; no change to clip frame boundaries.'
write(report_path,report)
print(json.dumps({'timelineSHA256':sha(ROOT/'src/timeline.json'),'h077CaptionCount':len(captions),'frames':tl['duration']}))
