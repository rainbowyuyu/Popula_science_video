"""Local, reproducible audio paths and source accounting."""
from pathlib import Path
import hashlib, json, subprocess, re, sys
if hasattr(sys.stdout,'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8',errors='replace')

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/audio'
TTS=Path('D:/python_project/tts')
MUSIC=ROOT/'public/audio/score.wav'
SR=48000
FPS=30

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def save(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    tmp.replace(path)

def story():
    p=ROOT/'src/story.json';s=json.loads(p.read_text(encoding='utf-8-sig'))
    cues=s['cues'];ids=[c['id'] for c in cues]
    assert len(ids)==len(set(ids)) and cues
    for c in cues:
        assert c['text'].strip() and c['spokenText'].strip() and c['scene']
    overridespath=OUT/'speech-overrides.json'
    overrides=json.loads(overridespath.read_text(encoding='utf8')) if overridespath.exists() else {}
    unknown=set(overrides)-set(ids)
    if unknown:raise ValueError('Speech overrides reference unknown cues: '+','.join(sorted(unknown)))
    for c in cues:
        if c['id'] in overrides:
            c['originalSpokenText']=c['spokenText'];c['spokenText']=overrides[c['id']]
    s['speechOverridesSha256']=sha(overridespath) if overridespath.exists() else None
    s['sourceStorySha256']=sha(p)
    return s

def measure(path):
    r=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af',
        'loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],
        capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    return json.loads(re.findall(r'\{[^{}]+\}',r.stderr,re.S)[-1])
