"""Extract review frames from the delivered MP4 and bind them to its SHA-256."""
from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
video = ROOT / 'output/ai_engineer_launch_v4_1080p60.mp4'
out = ROOT / 'research/qa/launch-v4-final-frames'
out.mkdir(parents=True, exist_ok=True)
story = json.loads((ROOT / 'src/launch-story.json').read_text('utf-8-sig'))
bridges = json.loads((ROOT / 'research/generation/launch-v4-bridges.json').read_text('utf-8-sig'))
frames = {24, 160, 284, 306, 444, 680, 714, 730, 770, 960, 1000, 1080, 1130, 1164,
          1400, 1446, 1740, 1860, 1885, 1890, 1915, 1920, 1938, 1980, 2000, 2064, 2300, 2346, 2400, 2760, 2880, 2910, 3060,
          3160, 3570, 3860, 3924, 4030, 4060, 4160, 4290, 4440, 4520,
          4680, 4740, 4800, 5160, 5400, 5460, 5520, 5580, 5664, 5900,
          5946, 6060, 6200, 6280, 6299}
for scene in story['scenes'][1:]:
    frames.update(scene['start'] + offset for offset in [-18, 0, 18, 60])
for bridge in bridges['bridges']:
    end = bridge['fromFrame'] + round((bridge['sourceDurationSeconds'] - bridge.get('sourceTrimSeconds', 0)) * 60)
    frames.update(end + offset for offset in [-25, -12, -1, 0, 12, 25])
frames = sorted(f for f in frames if 0 <= f < story['duration'])
expression = '+'.join(f'eq(n,{f})' for f in frames)
escaped_expression = expression.replace(',', '\\,')
command = ['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-y', '-i', str(video),
           '-vf', 'select='+escaped_expression, '-fps_mode', 'vfr',
           '-q:v', '2', str(out / 'extract-%04d.jpg')]
subprocess.run(command, check=True)
paths = []
for i, frame in enumerate(frames, 1):
    target = out / f'frame-{frame:06d}.jpg'
    (out / f'extract-{i:04d}.jpg').replace(target)
    paths.append(target)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 20)
for start in range(0, len(paths), 12):
    group = paths[start:start+12]
    sheet = Image.new('RGB', (1920, 386*((len(group)+2)//3)), '#e7eff0')
    draw = ImageDraw.Draw(sheet)
    for i, image_path in enumerate(group):
        frame = int(image_path.stem.split('-')[-1])
        scene = max((s for s in story['scenes'] if s['start'] <= frame), key=lambda s: s['start'])
        x, y = i%3*640, i//3*386
        with Image.open(image_path) as image:
            image.thumbnail((640, 360))
            sheet.paste(image, (x, y))
        draw.text((x+8, y+363), f'{frame} | {frame/60:.3f}s | {scene["id"]}', font=font, fill='#194556')
    sheet.save(out / f'contact-{start//12+1:02d}.jpg', quality=94)
report = {'video': str(video), 'videoSHA256': hashlib.file_digest(video.open('rb'), 'sha256').hexdigest(),
          'frames': frames, 'source': 'Decoded FINAL MP4, including source/native aperture joins and scene boundaries',
          'reviewed': False, 'limitation': 'Extraction alone is not aesthetic acceptance or full real-time viewing.'}
(out / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', 'utf8')
print(json.dumps({'frames': len(frames), 'directory': str(out), 'sha256': report['videoSHA256']}))
