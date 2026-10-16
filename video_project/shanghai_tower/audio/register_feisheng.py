"""Register latest explicitly selected local recording, retaining superseded history."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
HISTORY=Path('C:/Users/zju/.codex/skills/rainbow-science-short/references/music-history.json')
def read(p):return json.loads(p.read_text('utf-8-sig'))
pointer=read(ROOT/'audio/feisheng/current-arrangement.json');r=read(Path(pointer['report']))
record=dict(video='rainbow Shanghai Tower v7',sameFilmRevisionOf='rainbow Shanghai Tower',
 title=r['source']['title'],artist=r['source']['artist'],sha256=r['source']['sha256'],
 source=r['source']['path'],sourceType='user-selected local commercial recording',
 authorization='Latest user instruction explicitly selects this local recording, superseding The Sixth Axis and the earlier Douyin reference.',
 license='No Creative Commons or public-domain license asserted; publication rights not independently verified.',
 publicationLicenseIndependentlyVerified=False,status='arranged and mixed; final narration pending' if r['narrationDraft'] else 'final narration mix validated',
 durationSeconds=r['durationSeconds'],tempoBpm=r['beatGrid']['bpm'],pitchSemitones=0,
 musicSha256=r['hashes']['music.wav'],masterSha256=r['hashes']['master.wav'],timelineSHA256=r['timelineSHA256'],
 subjectiveListeningChecked=False,
 arrangementNote='Same-track phrases matched using chroma, percussion pattern and level; native progression and final cadence preserved; near-silent source tail shortened; small global tempo fit with pitch unchanged.')
history=read(HISTORY)
other_films=[x for x in history['records'] if x.get('sha256')==record['sha256'] and not x.get('video','').startswith('rainbow Shanghai Tower')]
assert not other_films,('Recording already used for another episode',other_films)
for previous in history['records']:
 if previous.get('video')==record['video'] and previous.get('title')=='The Sixth Axis':
  previous['status']='superseded by the user-selected 聲無哀樂SWAL — 飞升 before final delivery'
  previous['supersededBy']=record['source']
history['records']=[x for x in history['records'] if not(x.get('video')==record['video'] and x.get('title')==record['title'])]+[record]
HISTORY.write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Registered latest user-selected 飞升 for Shanghai Tower v7; previous selection retained as superseded.')
