from pathlib import Path
import json, shutil
R=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text('utf8'))
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2),'utf8')
candidate=R/'audio/candidates/zwind-pause'
d=read(candidate/'zwind-0.json');a=read(candidate/'asr/zwind-0.json')
assert a['sourceSHA256']==d['sha256'] and '风' in a['heard'] and not a['flags']
shutil.copy2(R/d['processed'],R/'public/voice/zwind-0.wav')
d['processed']='public/voice/zwind-0.wav';d['selectionReason']='Short pause separates Latin Z from Chinese wind; fresh ASR now recognizes 风. No claim of subjective listening.'
save(R/'audio/takes/zwind-0.json',d);save(R/'audio/asr/zwind-0.json',a)
for name in ['story.json','voice-story.json']:
    p=R/'research'/name;j=read(p)
    rows=j['shots'] if 'shots' in j else [r for s in j['scenes'] for r in s['lines']]
    for r in rows:
        if r['id']=='zwind-0':r['ttsText']=d['ttsText']
    save(p,j)
p=R/'scripts/write_story.py';p.write_text(p.read_text('utf8').replace("replace('Zwind','Z 风')","replace('Zwind','Z，风')"),'utf8')
print('Selected zwind pause take, ASR ratio',a['ratio'])
