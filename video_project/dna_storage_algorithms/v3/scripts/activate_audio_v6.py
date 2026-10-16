"""Activate the completed local voice, without replacing any V4 asset."""
from pathlib import Path
import hashlib,json,shutil
import soundfile as sf

root=Path(__file__).resolve().parents[1]
work=root/'work/audio-v6'
data=json.loads((work/'narration.json').read_text(encoding='utf8'))
assert data['version']==6 and data['voiceProvider']=='local-user-tts-project'
assert 250<data['durationSec']<360 and len(data['cues'])==37
assert data.get('timeStretch') is False and data.get('truncation') is not True
assert all(c['timingStatus']=='measured-local-natural-gap' for c in data['cues'])
mix=json.loads((work/'audio-mix-v6.json').read_text(encoding='utf8'))
assert float(mix['wav']['input_tp'])<=-1 and float(mix['aac']['input_tp'])<=-1
for entry in mix['inputs']+mix['files']:
    path=root/entry['path']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],str(path)
for name in ['master.wav','narration.wav']:
    info=sf.info(work/name)
    assert info.samplerate==48000 and info.channels==2
    assert info.frames==round(data['durationSec']*48000)
dest=root/'public/audio/v6';dest.mkdir(parents=True,exist_ok=True)
shutil.copytree(work/'clean',dest/'clean',dirs_exist_ok=True)
for name in ['master.wav','narration.wav','subtitles.srt']:
    shutil.copy2(work/name,dest/name)
for name in ['narration','captions']:
    shutil.copy2(work/f'{name}.json',root/f'src/{name}-v6.json')
print(json.dumps({'activatedVersion':6,'durationSec':data['durationSec'],'cues':37},ensure_ascii=False))
