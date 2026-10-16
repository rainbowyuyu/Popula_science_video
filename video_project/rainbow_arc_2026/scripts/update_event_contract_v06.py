"""Write measured utterance ranges into the visual/narration event contract."""
from pathlib import Path
import json, hashlib

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'research/audio/event-contract-v06.json'
timeline=json.loads((ROOT/'src/timeline.json').read_text('utf8'))
contract=json.loads(PATH.read_text('utf8'))
clips={row['id']:row for row in timeline['clips']}
active=[]
removed=contract.get('removedRepeatedBridgeEvents',[])
for event in contract['events']:
    if event['id'] not in clips:
        removed.append(event)
        continue
    row=clips[event['id']]
    event.update(text=row['text'],startSeconds=row['start'],
                 endSeconds=row['end'],startFrame=round(row['start']*timeline['fps']),
                 endFrame=round(row['end']*timeline['fps']),
                 audioSHA256=row['audioSHA256'])
    active.append(event)
contract.update(timing='Measured V06 personal-voice takes; no time stretch',
                events=active,removedRepeatedBridgeEvents=removed,
                removedAudioArchive='research/audio/long-edit-41-clips',
                fps=timeline['fps'],durationFrames=timeline['duration'],
                durationSeconds=timeline['duration']/timeline['fps'],
                scenes=timeline['scenes'],captionMethod=timeline['audio']['captionAlignment'])
PATH.write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n','utf8')
print(f"Locked {len(active)} visual/audio semantic ranges; {timeline['duration']} frames")
