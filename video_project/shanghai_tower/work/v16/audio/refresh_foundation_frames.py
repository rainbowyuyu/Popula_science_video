"""Refresh the four supplemental foundation stills from the assembled final MP4."""
from pathlib import Path
import json
import shutil
import subprocess

from verify_final_media import ROOT, digest, make_sheets, write_json


def main() -> None:
    video = ROOT / 'delivery/ShanghaiTower_1080p_v16.mp4'
    out = ROOT / 'research/qa/v16/main-foundation'
    index = out / 'additional-foundation-frames.json'
    prior = ROOT / 'work/v16/finishing/baseline/main-additional-foundation-frames.json'
    if index.exists() and not prior.exists():
        shutil.copy2(index, prior)
    entries = []
    commands = []
    for frame in [1850, 2160, 2250, 2700]:
        target = out / f'frame-{frame:05d}.jpg'
        command = ['ffmpeg', '-hide_banner', '-nostats', '-v', 'error', '-y',
                   '-i', str(video), '-map', '0:v:0', '-an',
                   '-vf', f'select=eq(n\\,{frame})', '-frames:v', '1', '-q:v', '2', str(target)]
        subprocess.run(command, check=True)
        commands.append(command)
        entries.append({'frame': frame, 'seconds': frame / 30,
                        'reasons': ['foundation-soil-label-and-pile-detail'],
                        'path': str(target), 'sha256': digest(target)})
    write_json(out / 'extraction-command.json', commands)
    report = {'videoSHA256': digest(video), 'entries': entries,
              'sheets': make_sheets(entries, out, out, False), 'manualFramesReviewed': [],
              'priorRecord': str(prior),
              'scope': 'Fresh exact frame-index extraction after official patch assembly; visual review recorded separately.'}
    write_json(index, report)
    print(json.dumps({'videoSHA256': report['videoSHA256'], 'frames': [x['frame'] for x in entries], 'report': str(index)}))


if __name__ == '__main__':
    main()
