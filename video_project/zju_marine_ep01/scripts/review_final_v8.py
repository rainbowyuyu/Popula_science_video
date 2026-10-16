"""Extract final decoded V8 chapter, typography and crossing frames for visual QA.

This is an extraction aid; the contact sheets must actually be inspected.
It never labels sampling as real-time viewing or listening.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('video', type=Path)
    ap.add_argument('--out', type=Path, required=True)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    story = json.loads((ROOT/'src/story.json').read_text(encoding='utf-8-sig'))
    end = math.ceil(max(s['end'] for s in story['scenes'])*30)-1
    frames = {0, 120, 297, 585, 693, 900, 1200, 1680, 2500, 3000,
              3350, 3500, 4300, 4800, 5406, 5407, 5700, 6500, 6850,
              7400, 7800, 8550, 8800, 8850, 8920, 9450, 9800,
              10300, 10640, 10770, end}
    groups = []
    for scene in story['scenes'][1:]:
        c = round(scene['start']*30)
        triplet = [c-1, c, c+1]
        frames.update(triplet)
        groups.append({'type':'chapter', 'name':scene.get('id', str(c)), 'frames':triplet})
    for t in [14.2660916, 23.6874145, 280.8488572, 302.3815801]:
        c = round(t*30)
        triplet = [c-3, c, c+3]
        frames.update(triplet)
        groups.append({'type':'waterline', 'time':t, 'frames':triplet})
    frames = sorted(f for f in frames if 0 <= f <= end)
    selected = '+'.join(f'eq(n\\,{f})' for f in frames)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                    '-i', str(args.video), '-an', '-vf', 'select='+selected,
                    '-fps_mode', 'passthrough', '-q:v', '2',
                    str(args.out/'decoded-%03d.jpg')], check=True)
    records = []
    for i, f in enumerate(frames):
        target = args.out/f'frame-{f:05d}.jpg'
        (args.out/f'decoded-{i+1:03d}.jpg').replace(target)
        records.append({'frame':f, 'time':f/30, 'path':target.name,
                        'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
    for page in range(math.ceil(len(records)/9)):
        board = Image.new('RGB', (1920,1170), '#eaf0ef')
        draw = ImageDraw.Draw(board)
        for j, row in enumerate(records[page*9:page*9+9]):
            x,y = j%3*640,j//3*390
            with Image.open(args.out/row['path']) as source:
                board.paste(source.resize((640,360), Image.Resampling.LANCZOS),(x,y))
            draw.text((x+10,y+365), f"frame {row['frame']} / {row['time']:.3f}s", font=font,fill='#123c4b')
        board.save(args.out/f'contact-{page+1:02d}.jpg', quality=94)
    result = {'video':str(args.video.resolve()),'samples':records,'groups':groups,
              'actualFullNormalSpeedViewing':False, 'subjectiveListeningChecked':False,
              'scope':'Final encoded frame extraction. Not an automatic aesthetic or motion approval.'}
    (args.out/'sample-manifest.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({'frames':len(records),'contactSheets':math.ceil(len(records)/9),'output':str(args.out)}))


if __name__ == '__main__':
    main()
