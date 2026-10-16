"""Promote only hash-verified, current-text candidate takes; preserve prior sources."""
from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text('utf-8-sig'))
def save(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
plan=read(ROOT/'audio/v7-selected-takes.json')
story=read(ROOT/'docs/story-v7.json');rows={r['id']:r for r in story['shots']}
pending=[]
for sid,candidate in plan['selected'].items():
 base=ROOT/'audio/candidates'/candidate
 take=read(base/f'{sid}.json');asr=read(base/'asr'/f'{sid}.json')
 expected=rows[sid].get('ttsText',rows[sid]['text'])
 assert take['ttsText']==expected and asr['expected']==expected,(sid,'stale text')
 assert take['sha256']==asr['sourceSHA256']==sha(ROOT/take['processed']),(sid,'stale hash')
 assert asr['ratio']>=.8 and not asr['flags'],(sid,asr['flags'])
 pending.append((sid,take,asr,candidate))
baseline=ROOT/'audio/v7-baseline';baseline.mkdir(parents=True,exist_ok=True)
for rel in ['docs/story.json','public/timeline.json','src/timeline.json']:
 dest=baseline/rel;dest.parent.mkdir(parents=True,exist_ok=True)
 if not dest.exists():shutil.copy2(ROOT/rel,dest)
report=[]
for sid,take,asr,candidate in pending:
 for rel in [f'audio/takes/{sid}.json',f'audio/asr/{sid}.json',f'public/voice/{sid}.wav']:
  dest=baseline/rel;dest.parent.mkdir(parents=True,exist_ok=True)
  if not dest.exists() and (ROOT/rel).exists():shutil.copy2(ROOT/rel,dest)
 voice=ROOT/'public/voice'/f'{sid}.wav';shutil.copy2(ROOT/take['processed'],voice)
 take['processed']=voice.relative_to(ROOT).as_posix();take['selectedCandidate']=candidate
 take['subjectiveListeningChecked']=False
 save(ROOT/'audio/takes'/f'{sid}.json',take);save(ROOT/'audio/asr'/f'{sid}.json',asr)
 report.append(dict(id=sid,candidate=candidate,sha256=sha(voice),duration=take['duration'],
                    asrRatio=asr['ratio'],flags=asr['flags'],edits=asr['edits'],subjectiveListeningChecked=False))
save(ROOT/'docs/story.json',story)
save(ROOT/'research/v7-voice-promotion.json',dict(promoted=report,baseline=baseline.relative_to(ROOT).as_posix(),
 sourceStorySHA256=sha(ROOT/'docs/story-v7.json'),subjectiveListeningChecked=False,
 policy='Waveform/text/hash verified; complete source waveform copied unchanged. ASR does not certify pleasantness or tones.'))
print('Promoted',len(report),'takes; timeline/mix must now be rebuilt from actual durations')
