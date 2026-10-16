"""Compare decoded same-time frames from full GPU 0 and offset GPU 1 renders.

This reads existing videos only. It neither launches rendering nor claims pixel
identity: independent H.264 GOP histories can introduce small codec differences.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FRAMES = [5508, 6000, 7200, 8700, 9750, 11014]


def command(argv):
    r = subprocess.run(argv, capture_output=True, text=True, encoding='utf8', errors='replace')
    if r.returncode:
        raise RuntimeError(r.stderr[-4000:])
    return r.stdout, r.stderr


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(2**20), b''):
            h.update(block)
    return h.hexdigest()


def probe(path):
    p = json.loads(command(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(path)])[0])
    return next(x for x in p['streams'] if x['codec_type'] == 'video')


def extract(path, frames, folder, name):
    expression = '+'.join(f'eq(n\\,{frame})' for frame in frames)
    command(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-i', str(path),
             '-map', '0:v:0', '-an', '-vf', 'select=' + expression,
             '-fps_mode', 'vfr', str(folder / f'{name}-%02d.png')])
    files = sorted(folder.glob(f'{name}-*.png'))
    if len(files) != len(frames):
        raise ValueError(f'Extracted {len(files)} {name} images; expected {len(frames)}')
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--full', type=Path, required=True)
    ap.add_argument('--tail', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    args = ap.parse_args()
    if args.out.exists() and any(args.out.iterdir()):
        raise FileExistsError('Output folder must be new or empty')
    args.out.mkdir(parents=True, exist_ok=True)
    sources = {}
    for name, path, expected in [('full', args.full, 11015), ('tail', args.tail, 5507)]:
        p = probe(path)
        if int(p['nb_frames']) != expected or p['r_frame_rate'] != '30/1' or [p['width'], p['height']] != [1920, 1080]:
            raise ValueError(f'{name} is not the expected production video')
        sources[name] = {'path': str(path.resolve()), 'sha256': sha(path), 'probe': p}
    full = extract(args.full, FRAMES, args.out, 'full')
    tail = extract(args.tail, [f-5508 for f in FRAMES], args.out, 'tail')
    rows = []
    sheet = Image.new('RGB', (1920, len(FRAMES)*410), '#142128')
    draw = ImageDraw.Draw(sheet)
    font_path = Path('C:/Windows/Fonts/arial.ttf')
    font = ImageFont.truetype(str(font_path), 19) if font_path.exists() else ImageFont.load_default()
    for i, (frame, a, b) in enumerate(zip(FRAMES, full, tail)):
        _, log = command(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(a), '-i', str(b),
                          '-lavfi', 'ssim', '-f', 'null', '-'])
        (args.out / f'ssim-{frame:05d}.log').write_text(log, encoding='utf8')
        match = re.search(r'SSIM\s+.*?All:([\d.]+)', log)
        if not match:
            raise ValueError('FFmpeg did not emit SSIM')
        ssim = float(match.group(1))
        ai, bi = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
        delta = np.abs(np.asarray(ai, dtype=np.float32)-np.asarray(bi, dtype=np.float32))
        row = {'globalFrame': frame, 'tailFrame': frame-5508, 'timeSeconds': frame/30,
               'ssimAll': ssim, 'meanAbsoluteChannelError255': float(np.mean(delta)),
               'p99AbsoluteChannelError255': float(np.percentile(delta, 99)),
               'pixelFractionMaxChannelErrorOver12': float(np.mean(delta.max(axis=2)>12)),
               'numericReviewNeeded': ssim < .98, 'fullImage': a.name, 'tailImage': b.name}
        rows.append(row)
        diff = Image.fromarray(np.clip(delta*4, 0, 255).astype(np.uint8))
        diff.save(args.out / f'difference-x4-{frame:05d}.png')
        for col, (im, title) in enumerate([(ai, 'GPU 0 full'), (bi, 'GPU 1 offset tail'), (diff, 'Absolute difference x4')]):
            sheet.paste(im.resize((640,360), Image.Resampling.LANCZOS), (640*col, i*410+38))
            draw.text((640*col+12, i*410+9), f'{title} | frame {frame} | SSIM {ssim:.6f}', font=font, fill='#ffffff')
    sheet.save(args.out / 'cross-gpu-contact.jpg', quality=94)
    report = {'schema': 'marine-v7-cross-gpu-seek-comparison', 'sources': sources,
              'frames': rows, 'minimumSSIM': min(r['ssimAll'] for r in rows),
              'numericReviewNeeded': any(r['numericReviewNeeded'] for r in rows),
              'threshold': {'ssimReviewBelow': .98},
              'frameExtraction': 'FFmpeg decoded frame index select; no timestamp rounding or approximate seek',
              'scope': 'Six same-time frames compare full sequential render vs offset start on another GPU.',
              'limitations': ['Independent H.264 GOP histories can differ slightly.',
                             'This checks samples, not every frame or motion smoothness.',
                             'Numerical closeness alone does not establish aesthetic quality or physical correctness.'],
              'subjectiveReviewComplete': False}
    (args.out / 'cross-gpu-report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({'minimumSSIM': report['minimumSSIM'], 'numericReviewNeeded': report['numericReviewNeeded'],
                      'report': str(args.out / 'cross-gpu-report.json')}))


if __name__ == '__main__':
    main()
