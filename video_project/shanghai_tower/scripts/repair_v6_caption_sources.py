"""Bind captions to the selected waveform; no synthesis or clip timing changes."""
from pathlib import Path
import shutil
from voice import ROOT,read,save,sha,spoken

tl=read(ROOT/'public/timeline.json')
before={c['id']:{k:c[k] for k in ['start','end','audioSHA256','voiceDurationSeconds']} for c in tl['clips']}
audio_before={name:sha(ROOT/'public'/name) for name in ['narration.wav','music.wav','master.wav']}
promoted=[];caption_changes=[]
for c in tl['clips']:
    sid=c['id'];dest=ROOT/'audio/asr'/f'{sid}.json'
    target=spoken(c)
    assert sha(ROOT/'public'/c['audio'])==c['audioSHA256'],sid
    candidates=[dest]+list((ROOT/'audio/candidates').glob(f'*/asr/{sid}.json'))
    exact=[p for p in candidates if p.exists() and read(p).get('sourceSHA256')==c['audioSHA256'] and read(p).get('expected')==target]
    if not exact:raise ValueError('No verified ASR matches selected audio/text '+sid)
    if exact[0]!=dest:
        shutil.copy2(exact[0],dest)
        promoted.append({'id':sid,'from':exact[0].relative_to(ROOT).as_posix(),'sha256':c['audioSHA256']})
    if c.get('caption')!=target:
        caption_changes.append({'id':sid,'before':c.get('caption'),'after':target})
    # Use the intended spoken transcript, never the ASR's spelling errors.
    c['caption']=target
    c['captionSource']='selected TTS transcript; exact waveform SHA matched ASR'
assert before=={c['id']:{k:c[k] for k in ['start','end','audioSHA256','voiceDurationSeconds']} for c in tl['clips']}
for folder in ['src','public']:save(ROOT/folder/'timeline.json',tl)
for file in ['docs/story.json','docs/story-v6.json']:
    path=ROOT/file
    if not path.exists():continue
    story=read(path);byid={c['id']:c for c in tl['clips']}
    for row in story['shots']:
        if row['id'] in byid:row['caption']=byid[row['id']]['caption']
    save(path,story)
assert audio_before=={name:sha(ROOT/'public'/name) for name in audio_before}
save(ROOT/'research/v6-caption-source-repair.json',dict(promoted=promoted,captionChanges=caption_changes,
    clipCount=len(tl['clips']),totalFrames=tl['duration'],audioHashes=audio_before,unchangedClipTiming=True,
    policy='Caption source is the selected TTS transcript, with exact waveform SHA-matched ASR word timing.'))
print('ASR promoted',len(promoted),'caption texts synchronized',len(caption_changes),'frames',tl['duration'])
