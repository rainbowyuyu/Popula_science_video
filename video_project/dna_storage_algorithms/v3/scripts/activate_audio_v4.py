"""Activate verified local narration without modifying the V3 fallback."""
from pathlib import Path
import json
import shutil
import hashlib

root=Path(__file__).resolve().parents[1]
work=root/'work/audio-v4'
data=json.loads((work/'narration.json').read_text(encoding='utf8'))
assert data['version']==4 and data['voiceProvider']=='local-user-tts-project'
assert data['durationSec']==300 and len(data['cues'])==37
assert all(c['timingStatus']=='measured-local-unscaled' for c in data['cues'])
mix=json.loads((work/'audio-mix-v4.json').read_text(encoding='utf8'))
assert float(mix['wav']['input_tp'])<=-1 and float(mix['aac']['input_tp'])<=-1
for entry in mix['files']:
    p=root/entry['path']
    assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256'],str(p)
dest=root/'public/audio/v4';dest.mkdir(parents=True,exist_ok=True)
shutil.copytree(work/'clean',dest/'clean',dirs_exist_ok=True)
for name in ['master.wav','narration.wav','subtitles.srt','preview-hook.mp3','preview-mechanism.mp3','preview-music.mp3','preview-return.mp3','voice-ab.wav']:
    shutil.copy2(work/name,dest/name)
for name in ['narration','captions']:
    shutil.copy2(work/f'{name}.json',root/f'src/{name}-v4.json')
for name in ['voice-generation-v4.json','audio-mix-v4.json','audio-sync-qa.json','asr-captions.json']:
    shutil.copy2(work/name,root/'research'/('local-'+name))
print('Activated 37 local clips, 300-second master, measured timeline and captions. V3 untouched.')
