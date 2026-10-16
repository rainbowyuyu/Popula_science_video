"""Extract hash-bound V11 encoded opening frames; does not issue a visual verdict."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
import qa_final as qa

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--manifest', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--step', type=int, default=3)
args = p.parse_args()
assert args.step > 0
manifest = json.loads(args.manifest.read_text('utf-8'))
args.out.mkdir(parents=True, exist_ok=True)
result = []
for segment in manifest['segments']:
    video = Path(segment['outputLocation'])
    with video.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    assert digest == segment['sha256']
    start, end = segment['start'], segment['end']
    out = args.out / f'{start}-{end}'
    frames = out / 'frames'
    frames.mkdir(parents=True, exist_ok=True)
    indices = list(range(start, end+1, args.step))
    subprocess.run(['C:/ffmpeg/bin/ffmpeg.exe', '-hide_banner', '-nostdin',
        '-loglevel', 'error', '-threads', '1', '-i', str(video),
        '-vf', f'select=not(mod(n\\,{args.step}))', '-fps_mode', 'vfr',
        '-q:v', '2', '-y', str(frames/'sample-%06d.jpg')], check=True)
    for i, frame in enumerate(indices, 1):
        (frames/f'sample-{i:06d}.jpg').replace(frames/f'frame-{frame:06d}.jpg')
    qa.OUT = out
    contacts = []
    for offset in range(0, len(indices), 20):
        target = out/f'contact-{offset//20+1:02d}.jpg'
        qa.contact(target, f'V11 encoded opening | step {args.step} frames',
            [(f, f'F{f} / {f/30:.3f}s') for f in indices[offset:offset+20]], columns=4, width=480)
        contacts.append(str(target.resolve()))
    result.append({'video':str(video.resolve()), 'sha256':digest,
        'range':[start,end], 'step':args.step, 'frames':indices, 'contacts':contacts})
report = {'scope':'Dense encoded frame stepping, not real-time playback or subjective listening.',
    'bundleFingerprint':manifest['bundleFingerprint'], 'segments':result, 'visualVerdict':None}
(args.out/'manifest.json').write_text(json.dumps(report, indent=2), 'utf-8')
print(json.dumps({'frames':sum(len(x['frames']) for x in result), 'manifest':str((args.out/'manifest.json').resolve())}))
