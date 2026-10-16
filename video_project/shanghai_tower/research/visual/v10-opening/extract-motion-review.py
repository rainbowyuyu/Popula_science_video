"""Extract deterministic three-frame-spaced contact sheets from frozen clips."""
from pathlib import Path
import json
import subprocess
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[3]
review = root / 'research/qa/v10-opening'
manifest = json.loads((review / 'motion-render.json').read_text(encoding='utf-8'))
ffmpeg = Path('C:/ffmpeg/bin/ffmpeg.exe')
ffprobe = ffmpeg.with_name('ffprobe.exe')
result = []
for clip in manifest['results']:
    file = Path(clip['outputLocation'])
    out = review / (clip['id'] + '-frames')
    out.mkdir(exist_ok=True)
    subprocess.run([str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-y',
                    '-i', str(file), '-vf', 'select=not(mod(n\\,3))', '-fps_mode', 'vfr',
                    str(out / 'sample-%03d.jpg')], check=True)
    paths = sorted(out.glob('sample-*.jpg'))
    width, height, columns = 360, 203, 4
    sheet = Image.new('RGB', (columns * width, ((len(paths)+columns-1)//columns)*(height+30)), '#edf2f3')
    draw = ImageDraw.Draw(sheet)
    for i, frame in enumerate(paths):
        x, y = (i%columns)*width, (i//columns)*(height+30)
        picture = Image.open(frame).convert('RGB').resize((width, height), Image.Resampling.LANCZOS)
        sheet.paste(picture, (x,y))
        number = clip['frames'][0] + i*3
        draw.text((x+8,y+height+5), f'F{number}  {number/30:.3f}s', fill='#243e49')
    sheet_file = review / (clip['id']+'-contact.jpg')
    sheet.save(sheet_file, quality=96)
    info = subprocess.run([str(ffprobe), '-v', 'error', '-show_entries',
                           'stream=index,codec_name,width,height,nb_frames,r_frame_rate,duration:format=duration',
                           '-of', 'json', str(file)], check=True, capture_output=True, text=True)
    result.append({'id':clip['id'], 'sourceSHA256':clip['sha256'], 'sampleStepFrames':3,
                   'sampleCount':len(paths), 'contact':str(sheet_file), 'ffprobe':json.loads(info.stdout)})
(review/'motion-frame-review.json').write_text(json.dumps({'scope':'Frame-step review assets, not proof of real-time playback or listening.', 'clips':result},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
