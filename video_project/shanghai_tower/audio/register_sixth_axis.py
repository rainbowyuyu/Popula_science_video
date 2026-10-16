"""Register the explicitly selected local recording without inventing a license."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
HISTORY=Path('C:/Users/zju/.codex/skills/rainbow-science-short/references/music-history.json')
def read(p):return json.loads(p.read_text('utf-8-sig'))
pointer=read(ROOT/'audio/sixth-axis/current-arrangement.json');r=read(Path(pointer['report']))
record=dict(video='rainbow Shanghai Tower v7',sameFilmRevisionOf='rainbow Shanghai Tower',
 title=r['source']['title'],artist=r['source']['artist'],sha256=r['source']['sha256'],
 source=r['source']['path'],sourceType='user-selected local commercial recording',
 authorization='User supplied the local file and explicitly selected this recording for this episode.',
 license='No Creative Commons or public-domain license asserted; publication rights not independently verified.',
 publicationLicenseIndependentlyVerified=False,status='arranged and mixed; final narration pending' if r['narrationDraft'] else 'final narration mix validated',
 durationSeconds=r['durationSeconds'],tempoBpm=r['beatGrid']['bpm'],pitchSemitones=0,
 musicSha256=r['hashes']['music.wav'],masterSha256=r['hashes']['master.wav'],timelineSHA256=r['timelineSHA256'],
 subjectiveListeningChecked=False,
 arrangementNote='Matched same-track phrases, preserved final cadence, trimmed nearly silent source reverb tail; small global tempo fit with pitch unchanged.')
history=read(HISTORY)
other_films=[x for x in history['records'] if x.get('sha256')==record['sha256'] and not x.get('video','').startswith('rainbow Shanghai Tower')]
assert not other_films,('Recording already used for another episode',other_films)
history['records']=[x for x in history['records'] if x.get('video')!=record['video']]+[record]
HISTORY.write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Registered user-selected Sixth Axis for Shanghai Tower v7; no CC0 claim.')
