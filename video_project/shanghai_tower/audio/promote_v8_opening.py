"""Promote the four checked atlas takes, preserving all later selected sounds."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'audio/v8-baseline'

def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

keep=read(BASE/'preserved-s005-s048.json')
story=read(ROOT/'docs/story-v8.json')
rows={x['id']:x for x in story['shots']}
selected=read(ROOT/'audio/v8-selected-takes.json')['selected']
assert set(selected)=={'s001','s002','s003','s004'}
pending=[]
for sid,candidate in selected.items():
    directory=ROOT/'audio/candidates'/candidate
    take=read(directory/f'{sid}.json')
    asr=read(directory/'asr'/f'{sid}.json')
    expected=rows[sid].get('ttsText',rows[sid]['text'])
    assert take['ttsText']==expected==asr['expected']
    assert take['sha256']==asr['sourceSHA256']==sha(ROOT/take['processed'])
    assert not take['rawEndpointFlag'] and not asr['flags'] and asr['ratio']>=.8,(sid,asr['flags'])
    pending.append((sid,candidate,take,asr))

for sid,hashes in keep.items():
    for kind,relative in [('voice',f'public/voice/{sid}.wav'),('take',f'audio/takes/{sid}.json'),('asr',f'audio/asr/{sid}.json')]:
        assert sha(ROOT/relative)==hashes[kind],(sid,kind,'changed before promotion')

report=[]
for sid,candidate,take,asr in pending:
    destination=ROOT/'public/voice'/f'{sid}.wav'
    shutil.copy2(ROOT/take['processed'],destination)
    take['processed']=destination.relative_to(ROOT).as_posix()
    take['selectedCandidate']=candidate
    take['subjectiveListeningChecked']=False
    save(ROOT/'audio/takes'/f'{sid}.json',take)
    save(ROOT/'audio/asr'/f'{sid}.json',asr)
    report.append({'id':sid,'candidate':candidate,'sha256':sha(destination),'duration':take['duration'],
                   'asrRatio':asr['ratio'],'flags':asr['flags'],'edits':asr['edits'],
                   'subjectiveListeningChecked':False,'pronunciationListeningVerified':False})
save(ROOT/'docs/story.json',story)
save(ROOT/'research/v8-voice-promotion.json',{
    'promoted':report,'baseline':'audio/v8-baseline','preservedVoices':44,
    'preservedVoiceHashFile':'audio/v8-baseline/preserved-s005-s048.json',
    'sourceStorySHA256':sha(ROOT/'docs/story-v8.json'),
    'subjectiveListeningChecked':False,'pronunciationListeningVerified':False,
    'policy':'Only first four selected sounds replaced; full source waveforms, no time stretching or speech trimming.'})
print('PROMOTED_FIRST_FOUR',sum(x['duration'] for x in report),'seconds; s005-s048 preserved')
