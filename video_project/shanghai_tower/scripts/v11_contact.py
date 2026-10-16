"""Create review sheets from actually rendered opening stills; no quality verdict."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('stills', type=Path)
args = p.parse_args()
manifest = json.loads((args.stills / 'stills.json').read_text('utf-8'))
shots = manifest['shots']
pages = []
for start in range(0, len(shots), 12):
    page = Image.new('RGB', (1920, 900), '#e7e7e4')
    draw = ImageDraw.Draw(page)
    for i, shot in enumerate(shots[start:start+12]):
        x, y = (i % 4) * 480, (i // 4) * 300
        with Image.open(args.stills / shot['file']) as src:
            page.paste(src.convert('RGB').resize((480, 270), Image.Resampling.LANCZOS), (x, y))
        draw.text((x+12, y+277), f"F{shot['frame']} / {shot['frame']/30:.3f}s", fill='#172a31')
    dest = args.stills / f'contact-{start//12+1:02d}.jpg'
    page.save(dest, quality=95)
    pages.append(str(dest.resolve()))
print(json.dumps({'pages': pages, 'frames': len(shots)}))
