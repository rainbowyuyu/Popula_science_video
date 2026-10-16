"""Extract adjacent encoded frames for visual review; never issue a quality verdict."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import qa_final as qa


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--video', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--centres', required=True, help='Comma-separated global frame indices')
    p.add_argument('--start-frame', type=int, default=0, help='Global index of a rendered segment first frame')
    args = p.parse_args()
    video = args.video.resolve()
    out = args.out.resolve()
    frames_dir = out / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    probe = json.loads(subprocess.check_output(['C:/ffmpeg/bin/ffprobe.exe', '-v', 'error',
        '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames', '-of', 'json', str(video)]))
    count = int(probe['streams'][0]['nb_frames'])
    centres = sorted(set(int(v) for v in args.centres.split(',')))
    offsets = [-15, -1, 0, 1, 15]
    selected = sorted(set(f + d for f in centres for d in offsets
        if args.start_frame <= f + d < args.start_frame + count))
    if not selected:
        raise ValueError('No requested frames in the input video')
    selection = '+'.join(f'eq(n\\,{f-args.start_frame})' for f in selected)
    subprocess.run(['C:/ffmpeg/bin/ffmpeg.exe', '-hide_banner', '-nostdin', '-loglevel', 'error',
        '-i', str(video), '-vf', f'select={selection}', '-fps_mode', 'vfr', '-q:v', '2',
        '-y', str(frames_dir / 'selected-%06d.jpg')], check=True)
    for i, frame in enumerate(selected, 1):
        (frames_dir / f'selected-{i:06d}.jpg').replace(frames_dir / f'frame-{frame:06d}.jpg')
    qa.OUT = out
    contacts = []
    for page in range(0, len(centres), 4):
        items = [(f + d, f'centre {f} | frame {f+d}') for f in centres[page:page+4]
                 for d in offsets if f + d in selected]
        target = out / f'motion-{page//4+1:02d}.jpg'
        qa.contact(target, 'Encoded adjacent frames | -15 / -1 / 0 / +1 / +15', items, columns=5, width=384)
        contacts.append(str(target))
    with video.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    manifest = {'video': str(video), 'videoSHA256': digest, 'startFrame': args.start_frame,
                'centres': centres, 'offsets': offsets, 'frames': selected, 'contacts': contacts,
                'qualityVerdict': None}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'frames': len(selected), 'contacts': contacts}))


if __name__ == '__main__':
    main()
