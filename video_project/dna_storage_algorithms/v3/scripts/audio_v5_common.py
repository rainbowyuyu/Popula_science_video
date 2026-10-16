"""Shared V5 audio contracts. Reading or validating a story never starts TTS."""
from pathlib import Path
import copy, hashlib, json, re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'work/audio-v5'
DEFAULT_STORY = ROOT / 'src/story-v5.json'
TTS = Path('D:/python_project/tts')
SR = 48000
FPS = 30

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda:f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def save(path, obj):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf8')

def load_story(path=DEFAULT_STORY):
    path = Path(path)
    if not path.exists(): raise FileNotFoundError(f'Final V5 story is not present: {path}')
    story = json.loads(path.read_text(encoding='utf8'))
    if not isinstance(story.get('cues'),list) or not story['cues']:
        raise ValueError('story.cues must contain final spoken/display text')
    if not isinstance(story.get('groups'),list) or not story['groups']:
        raise ValueError('story.groups must define the ordered chapter ids')
    ids=[c['id'] for c in story['cues']]; groups=[g['id'] for g in story['groups']]
    if len(ids)!=len(set(ids)) or len(groups)!=len(set(groups)): raise ValueError('Duplicate ids')
    if any(not re.fullmatch(r'[A-Za-z0-9_-]+',str(x)) for x in ids+groups): raise ValueError('Unsafe id')
    for c in story['cues']:
        if c.get('shotId') not in groups: raise ValueError('Unknown shotId: '+str(c))
        if not isinstance(c.get('text'),str) or not c['text'].strip(): raise ValueError('Empty display text')
        c.setdefault('spokenText',c['text'])
        if not isinstance(c['spokenText'],str) or not c['spokenText'].strip(): raise ValueError('Empty spoken text')
        gap=float(c.get('gapAfterSec',story.get('gapAfterSec',.32)))
        if not .2 <= gap <= .5: raise ValueError(f"{c['id']}: gapAfterSec must be 0.2–0.5 seconds")
        c['gapAfterSec']=gap
    order={g:i for i,g in enumerate(groups)}
    if [order[c['shotId']] for c in story['cues']] != sorted(order[c['shotId']] for c in story['cues']):
        raise ValueError('Cues must follow group order; a chapter may not recur later')
    if any(not any(c['shotId']==g for c in story['cues']) for g in groups): raise ValueError('Empty chapter')
    story.setdefault('fps',FPS)
    if story['fps'] != FPS: raise ValueError('This film uses 30fps')
    story.setdefault('targetDurationSec',300)
    story.setdefault('codaSeconds',10)
    if not 5 <= float(story['codaSeconds']) <= 15: raise ValueError('codaSeconds must be 5–15')
    story.setdefault('openingLeadSec',.3)
    if not 0 <= float(story['openingLeadSec']) <= .5: raise ValueError('Opening lead must be <=0.5s')
    story['sourceStoryPath']=str(path.resolve())
    story['sourceStorySha256']=sha(path)
    return story

def natural_timeline(story, durations):
    """Place complete, non-overlapping clips with bounded gaps; no window fill.

    durations is {cueId: actualCleanSeconds}.  The chapter handoff lives at the
    midpoint of a single gap, so previous-tail and next-lead cannot add twice.
    Requested old section windows are metadata only.  Never stretch speech or
    add silence to make the total equal targetDurationSec.
    """
    result=copy.deepcopy(story)
    at=float(result['openingLeadSec'])
    for cue in result['cues']:
        seconds=float(durations[cue['id']])
        if seconds<=0: raise ValueError('Nonpositive clip duration')
        cue.update(startSec=round(at,6),endSec=round(at+seconds,6),actualDuration=seconds,
                   startFrame=round(at*FPS),endFrame=round((at+seconds)*FPS),timingStatus='measured-local-natural-gap')
        at+=seconds+cue['gapAfterSec']
    for i,group in enumerate(result['groups']):
        these=[c for c in result['cues'] if c['shotId']==group['id']]
        first,last=these[0],these[-1]
        pos=result['cues'].index(first)
        start=0 if i==0 else (result['cues'][pos-1]['endSec']+first['startSec'])/2
        pos=result['cues'].index(last)
        end=last['endSec']+.35 if pos==len(result['cues'])-1 else (last['endSec']+result['cues'][pos+1]['startSec'])/2
        if 'startSec' in group: group['requestedStartSec']=group['startSec']
        if 'endSec' in group: group['requestedEndSec']=group['endSec']
        if 'timingStatus' in group: group['requestedTimingStatus']=group['timingStatus']
        group.update(startSec=round(start,6),endSec=round(end,6),startFrame=round(start*FPS),endFrame=round(end*FPS),
                     timingMode='natural; requested windows never padded',timingStatus='measured-local-natural-gap')
    codaStart=result['groups'][-1]['endSec']
    totalFrames=int(__import__('math').ceil((codaStart+float(result['codaSeconds']))*FPS))
    result.update(version=5,durationFrames=totalFrames,durationSec=totalFrames/FPS,timeStretch=False,truncation=False,
                  timelinePadding=False,voiceProvider='local-user-tts-project',voiceModel='Qwen3-TTS-0.6B',
                  timingStatus='measured-local-natural-gap')
    result['coda']={'startSec':codaStart,'endSec':totalFrames/FPS,'startFrame':round(codaStart*FPS),'endFrame':totalFrames,
                    'timingStatus':'measured-local-natural-gap'}
    result['targetDeltaSec']=round(result['durationSec']-float(result['targetDurationSec']),6)
    result['durationReview']='within +/-15s target' if abs(result['targetDeltaSec'])<=15 else 'revise story or accept natural duration; do not pad pauses'
    return result

def source_plan(story):
    chars=sum(len(re.sub(r'[\s，。！？；：、,.!?;:]','',c['spokenText'])) for c in story['cues'])
    baselinePath=ROOT/'src/narration-v4.json'
    rate=4.4;basis='conservative Chinese local narration estimate'
    if baselinePath.exists():
        baseline=json.loads(baselinePath.read_text(encoding='utf8'))
        baselineChars=sum(len(re.sub(r'[\s，。！？；：、,.!?;:]','',c['spokenText'])) for c in baseline['cues'])
        if baseline.get('totalRawSpeechClipSec',0)>0:
            rate=baselineChars/baseline['totalRawSpeechClipSec']
            basis=f'measured V4 personal voice: {baselineChars} characters / {baseline["totalRawSpeechClipSec"]:.3f}s'
    rawEstimate=chars/rate
    gapTotal=sum(c['gapAfterSec'] for c in story['cues'][:-1])
    return {'status':'plan-only-no-generation','storySha256':story['sourceStorySha256'],
            'cueCount':len(story['cues']),'spokenCharacters':chars,'estimatedRawSec':round(rawEstimate,2),
            'estimatedFilmSec':round(rawEstimate+.24*len(story['cues'])+gapTotal+story['codaSeconds']+.65,2),
            'measuredCharactersPerSecond':rate,'estimateBasis':basis,
            'estimateCaveat':'Measured local synthesis duration is authoritative; no speed change or silence padding',
            'localModel':str(TTS/'models/Qwen3-TTS-0.6B'),'referenceAudio':str(TTS/'work/clone-reference.wav')}
