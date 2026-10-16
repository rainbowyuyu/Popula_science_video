"""Reuse only exact-text, reference-identical whole v7 takes for the v8 edit."""
from pathlib import Path
import json, shutil
from voice_episode3v7 import ROOT, TTS, spoken_text, sha, dump

reports=ROOT/'research/episode3v8'
public=ROOT/'public/episode3v8'
rows=json.loads((reports/'story.json').read_text(encoding='utf-8'))['clips']
old=json.loads((ROOT/'research/episode3v7/audio-generation.json').read_text(encoding='utf-8'))
cache=json.loads((ROOT/'research/episode3v7/audio-asr-cache.json').read_text(encoding='utf-8'))
reference_hash=sha(TTS/'work/clone-reference.wav')
ledger_path=reports/'audio-generation.json'
ledger=json.loads(ledger_path.read_text(encoding='utf-8')) if ledger_path.exists() else {}
index={entry['text']:(clipid,entry) for clipid,entry in old.items()}
reused=[]
for row in rows:
    spoken,_=spoken_text(row)
    if spoken not in index: continue
    clipid,entry=index[spoken]
    original=ROOT/'public/episode3v7/voice-raw'/f'{clipid}.wav'
    if entry.get('referenceSha256')!=reference_hash or not original.exists() or sha(original)!=entry['sha256']: continue
    destination=public/'voice-raw'/f"{row['id']}.wav"
    if destination.exists() and sha(destination)!=entry['sha256']: continue
    destination.parent.mkdir(parents=True,exist_ok=True)
    if not destination.exists(): shutil.copy2(original,destination)
    ledger[row['id']]={**entry,'sourceKind':'verified-v7-reuse','sourceClip':clipid,
        'sourceFile':str(original),'file':destination.relative_to(ROOT).as_posix(),
        'acceptedCandidate':'Exact spoken text and reference/source hashes match the previous whole take',
        'subjectiveListeningChecked':False}
    reused.append({'id':row['id'],'sourceId':clipid,'text':row['text'],'sha256':entry['sha256']})
dump(ledger_path,ledger)
newcachepath=reports/'audio-asr-cache.json'
newcache=json.loads(newcachepath.read_text(encoding='utf-8')) if newcachepath.exists() else {}
for row in reused:
    if row['sha256'] in cache:newcache[row['sha256']]=cache[row['sha256']]
dump(newcachepath,newcache)
dump(reports/'audio-reuse-v7.json',{'reused':reused,'new_or_changed_takes':len(rows)-len(reused)})
print(f'Reused {len(reused)} whole takes; {len(rows)-len(reused)} require generation.')
