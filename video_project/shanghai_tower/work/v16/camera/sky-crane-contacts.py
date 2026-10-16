from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json, hashlib
import sys

root = Path(__file__).resolve().parents[3]
groups = [('sky-crane-repair', 3, 640, 360), ('sky-crane-main-quarters', 3, 640, 360), ('sky-crane-vertical-quarters', 3, 360, 640)]
if '--clear' in sys.argv:
    groups = [('sky-crane-clear-main', 3, 640, 360), ('sky-crane-clear-vertical', 3, 360, 640)]
output = root / 'work/v16/camera/sky-crane-review'
output.mkdir(parents=True, exist_ok=True)
index = []
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 20)
for tag, cols, w, h in groups:
    folder = root / 'tmp/v16' / (tag + '-stills')
    manifest = json.loads((folder / 'stills.json').read_text())
    files = [(f, folder / f'frame-{f}.jpg') for f in manifest['shots']]
    for batch_index in range(0, len(files), 9):
        batch = files[batch_index:batch_index+9]
        rows = (len(batch)+cols-1)//cols
        sheet = Image.new('RGB', (cols*w, rows*(h+30)), '#172229')
        draw = ImageDraw.Draw(sheet)
        for i, (frame, path) in enumerate(batch):
            image = Image.open(path).convert('RGB').resize((w,h), Image.Resampling.LANCZOS)
            x, y = (i%cols)*w, (i//cols)*(h+30)
            sheet.paste(image, (x,y))
            draw.text((x+9,y+h+4), f'{tag}: F{frame}', font=font, fill='white')
        target = output / f'{tag}-{batch_index//9+1:02d}.jpg'
        sheet.save(target, quality=94)
        index.append({'tag':tag,'frames':[f for f,_ in batch], 'path':str(target), 'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
(output / ('clear-contact-index.json' if '--clear' in sys.argv else 'contact-index.json')).write_text(json.dumps(index, indent=2), encoding='utf-8')
print(json.dumps(index, indent=2))
