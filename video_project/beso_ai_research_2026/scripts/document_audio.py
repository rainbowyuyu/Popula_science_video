from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text('utf8'))
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),'utf8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
s=read(R/'src/beso-story.json');q=read(R/'research/audio-voice-qa.json')
save(R/'research/qa/narration-manifest.json',dict(engine='Qwen3-TTS-0.6B local reference clone',referenceExported=False,pronunciation={'Zwind':'Z，风','图强号':'图强号','BESO':'贝索'},durationFrames=s['duration'],fps=s['fps'],scenes=len(s['scenes']),utterances=q['completed'],qaFlags=q['flagged'],timelineSHA256=sha(R/'src/beso-story.json'),masterSHA256=sha(R/'public/audio/master.wav'),subjectiveListeningChecked=False,pronunciationListeningVerified=False))
p=R/'research/qa/pronunciation-beso-ai.json';d=read(p)
for r in d['entries']:
    if r['display']=='Zwind':r['spoken']='Z，风';r['selectedTake']='audio/takes/zwind-0.json';r['freshASR']='Z风';r['listeningVerified']=False
    if r['display']=='图强号':r['selectedTake']='audio/takes/compare-0.json';r['freshASR']='图墙号（同音字替换）';r['listeningVerified']=False
save(p,d)
print('Final audio manifests updated.')
