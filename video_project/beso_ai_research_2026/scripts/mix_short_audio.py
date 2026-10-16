import json
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
story=json.loads((ROOT/'src'/'beso-story-compact.json').read_text(encoding='utf-8'))
inputs=[]
for scene in story['scenes']:
    for clip in scene['clips']:
        path=ROOT/'public'/clip['file']
        if not path.exists():
            raise FileNotFoundError(path)
        start_ms=round((scene['start']+clip['from'])/story['fps']*1000)
        inputs.append((path,start_ms))

out=ROOT/'public'/'audio'/'beso-short-voice.wav'
args=['ffmpeg','-y']
for path,_ in inputs:
    args += ['-i',str(path)]
filters=[]
for i,(_,start_ms) in enumerate(inputs):
    filters.append(f'[{i}:a]adelay={start_ms}|{start_ms},aresample=48000[a{i}]')
mix=''.join(f'[a{i}]' for i in range(len(inputs)))+f'amix=inputs={len(inputs)}:duration=longest:normalize=0,alimiter=limit=0.95[voice]'
filters.append(mix)
args += ['-filter_complex',';'.join(filters),'-map','[voice]','-ar','48000','-ac','2','-c:a','pcm_s16le',str(out)]
subprocess.run(args,check=True)
print(out)
