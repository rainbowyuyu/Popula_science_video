"""Extract final-MP4 temporal strips. This is frame review, not normal-speed watching."""
from pathlib import Path
import hashlib
import json
import subprocess
import shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'delivery/nobel2026_v5_1/qa/temporal'
MOVIE = ROOT / 'delivery/nobel2026_v5_1/一束蓝光能叫醒一颗神经元_v5_1_完整预览1080p.mp4'
TL = json.loads((ROOT / 'src/nobel2026/timeline-v51.json').read_text(encoding='utf-8-sig'))

def cue(cid, index=0):
    clip = next(c for c in TL['clips'] if c['id'] == cid)
    return clip['start'] + round(clip['subtitleParts'][index]['start'] * 30)

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()

OUT.mkdir(parents=True, exist_ok=True)
centers = {
    'opening-gestures': cue('000', 1) + 35,
    'pore-and-current': cue('008', 1) + 40,
    'fresh-light-response': cue('014', 1) + 25,
    'cortex-to-wake': next(c['start'] for c in TL['clips'] if c['id']=='016'),
    'wake-to-memory': next(c['start'] for c in TL['clips'] if c['id']=='017'),
    'clinical-to-recap': next(c['start'] for c in TL['clips'] if c['id']=='020'),
    'recap-to-references': next(s['start'] for s in TL['scenes'] if s['id']=='references'),
    'logo-tail': TL['duration'] - 55,
}
groups = {name: [max(0,min(TL['duration']-1,n+d)) for d in range(-45,46,5)] for name,n in centers.items()}
frames = sorted(set(n for seq in groups.values() for n in seq))
ffmpeg = shutil.which('ffmpeg') or 'C:/ffmpeg/bin/ffmpeg.exe'
expr = '+'.join(f'eq(n\\,{n})' for n in frames)
subprocess.run([ffmpeg, '-hide_banner','-loglevel','error','-y','-i',str(MOVIE),
    '-map','0:v:0','-vf',f'select={expr},scale=960:-2','-fps_mode','vfr',
    '-start_number','0',str(OUT/'frame-%04d.jpg')],check=True)
lookup = {n: OUT/f'frame-{i:04d}.jpg' for i,n in enumerate(frames)}
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
for name, seq in groups.items():
    sheet = Image.new('RGB',(1920,5*298),'#f4f0e5')
    draw = ImageDraw.Draw(sheet)
    for i,n in enumerate(seq):
        x,y=i%4*480,i//4*298
        with Image.open(lookup[n]) as pic:
            sheet.paste(pic.resize((480,270)),(x,y))
        draw.text((x+7,y+273),f'f{n} · {n/30:.3f}s',font=font,fill='#163e48')
    sheet.save(OUT/f'{name}.jpg',quality=92)
(OUT/'manifest.json').write_text(json.dumps({
    'movieSHA256':digest(MOVIE),'samplingFPS':6,'frames':groups,
    'method':'Exact decoded frames; one every five source frames for three seconds per range.',
    'normalSpeedReview':False,
},ensure_ascii=False,indent=2),encoding='utf-8')
print(OUT)
