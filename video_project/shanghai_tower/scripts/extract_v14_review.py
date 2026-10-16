"""Extract actual encoded frames and contact sheets without modifying the video.

Usage: python scripts/extract_v14_review.py VIDEO --frames 80,90,105,120,136
       --out research/qa/v14-release/encoded-opening
Frame numbers are zero-based indices of decoded frames in the supplied file.
For a segment, add its timeline offset when recording global review evidence.
"""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont, ImageOps

from v12_common import (
    FFMPEG, FFPROBE, ROOT, digest, project_path, record, require, run, save,
)
import json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', help='Encoded source video inside the project')
    parser.add_argument('--frames', required=True, help='Comma-separated zero-based encoded frame indices')
    parser.add_argument('--out', required=True, help='Fresh project directory for extracted frames and sheets')
    args = parser.parse_args()
    require(re.fullmatch(r'\d+(,\d+)*', args.frames), 'Expected comma-separated nonnegative frame indices')
    frames = sorted(set(int(value) for value in args.frames.split(',')))
    video, out = project_path(args.video), project_path(args.out)
    require(video.is_file(), 'Encoded source video is missing')
    require(not out.exists(), 'Evidence directory already exists; select a fresh directory')
    input_sha = digest(video)
    out.mkdir(parents=True, exist_ok=False)
    metadata = json.loads(run([
        FFPROBE, '-v', 'error', '-count_frames', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames,nb_frames',
        '-of', 'json', video,
    ], out / 'source-probe.log'))
    require(len(metadata.get('streams', [])) == 1, 'Expected one selected video stream')
    stream = metadata['streams'][0]
    count = int(stream['nb_read_frames'])
    require(frames[-1] < count, f'Requested frame is outside encoded video: {count} frames')
    select = 'select=' + '+'.join(f'eq(n\\,{frame})' for frame in frames)
    run([
        FFMPEG, '-hide_banner', '-v', 'error', '-xerror', '-n', '-i', video,
        '-map', '0:v:0', '-an', '-vf', select, '-fps_mode', 'vfr',
        '-frames:v', len(frames), '-start_number', '0', out / 'extracted-%06d.png',
    ], out / 'frame-extraction.log')
    numbered = sorted(out.glob('extracted-*.png'))
    require(len(numbered) == len(frames), 'Not all requested encoded frames were extracted')
    extracted = []
    for frame, path in zip(frames, numbered):
        target = out / f'frame-{frame:06d}.png'
        require(not target.exists(), 'Frame target already exists')
        path.rename(target)
        with Image.open(target) as image:
            require(image.size == (stream['width'], stream['height']), 'Extracted dimensions differ')
        extracted.append({'encodedFrame': frame, **record(target)})
    font_path = Path('C:/Windows/Fonts/arialbd.ttf')
    font = ImageFont.truetype(str(font_path), 23) if font_path.exists() else ImageFont.load_default(size=23)
    sheets = []
    for page, offset in enumerate(range(0, len(extracted), 6), 1):
        selected = extracted[offset:offset + 6]
        rows = (len(selected) + 1) // 2
        sheet = Image.new('RGB', (1920, rows * 540), '#e8eef0')
        drawing = ImageDraw.Draw(sheet)
        for index, item in enumerate(selected):
            x, y = (index % 2) * 960, (index // 2) * 540
            with Image.open(ROOT / item['file']) as source:
                thumb = ImageOps.contain(source.convert('RGB'), (960, 540), Image.Resampling.LANCZOS)
                sheet.paste(thumb, (x + (960 - thumb.width) // 2, y + (540 - thumb.height) // 2))
            label = f'FRAME {item["encodedFrame"]}'
            box = drawing.textbbox((0, 0), label, font=font)
            drawing.rounded_rectangle((x + 10, y + 10, x + 32 + box[2], y + 49), radius=5, fill='#123440')
            drawing.text((x + 21, y + 15), label, font=font, fill='white')
        sheet_path = out / f'contact-{page:02d}.jpg'
        sheet.save(sheet_path, quality=95, subsampling=0)
        sheets.append({'encodedFrames': [item['encodedFrame'] for item in selected], **record(sheet_path)})
    require(digest(video) == input_sha, 'Encoded source video changed during extraction')
    report = {
        'schema': 'rainbow.v14-encoded-frame-evidence/1',
        'createdAtUTC': datetime.now(timezone.utc).isoformat(),
        'input': record(video), 'inputSHA256': input_sha,
        'encodedFrameCount': count, 'videoFormat': stream,
        'requestedFrameNumbers': frames, 'frameNumberConvention': 'zero-based decoded frame index in supplied video',
        'contactSheetCellPixels': [960, 540], 'contactSheetColumns': 2,
        'frames': extracted, 'contactSheets': sheets,
        'sourceVideoModified': False, 'visualReviewPerformed': False,
        'scope': 'Evidence extraction only. Full-resolution PNGs contain actual decoded source frames. '
                 'Frame labels are added only to contact sheets and do not alter the video or extracted PNGs.',
    }
    save(out / 'extraction.json', report, exclusive=True)
    print(json.dumps({'out': str(out), 'frames': frames, 'inputSHA256': input_sha,
                      'sheets': len(sheets), 'visualReviewPerformed': False}))


if __name__ == '__main__':
    main()
