"""Extract exact-frame seam evidence from the composed, QA-locked final V5 MP4.

For every real base/patch edit, collect offsets -15, -1, 0, +1, +15 relative
to the first incoming frame. All inputs are read-only. Reports remain pending
subjective review; successful extraction does not certify a seamless edit.

Run after composition and qa_final.py --revision v5. --describe-plan only
examines the timeline/plan and never opens video or requires completed QA.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'delivery/GLP1_V5_1080p.mp4'
TIMELINE = ROOT / 'src/timeline.json'
MASTER = ROOT / 'public/master.wav'
MARKER = ROOT / 'tmp/final-render.json'
MAIN_QA = ROOT / 'research/qa/final-v5/automatic-report.json'
DEFAULT_PLAN = ROOT / 'research/revision-v5/patches/patch-plan.json'
OUT = ROOT / 'research/qa/final-v5/patch-boundaries'
OFFSETS = (-15, -1, 0, 1, 15)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def read(path):
    require(path.is_file(), f'Required input missing: {path}')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def rel(path):
    return path.relative_to(ROOT).as_posix()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def clip_at(timeline, frame):
    return next((c['id'] for c in timeline['clips'] if c['start'] <= frame < c['end']),
                'opening-or-coda')


def build_seams(plan, timeline):
    total = timeline['duration']
    require(plan.get('version') == 'v5-local-patches', 'Unsupported patch plan.')
    require(plan.get('fps') == timeline['fps'] == 30, 'Expected the frozen 30 fps timeline.')
    require(type(total) is int and total > 0, 'Invalid timeline duration.')
    rows = plan.get('patches')
    require(isinstance(rows, list) and rows, 'Patch plan is empty.')
    segments, cursor = [], 0
    for index, row in enumerate(rows):
        start, end = row.get('start'), row.get('end')
        require(type(start) is int and type(end) is int and 0 <= start <= end < total,
                f'Invalid patch bounds: {index + 1}')
        require(start >= cursor, 'Patch ranges overlap or are unordered.')
        if start > cursor:
            segments.append({'kind': 'base', 'start': cursor, 'end': start - 1})
        segments.append({'kind': 'patch', 'start': start, 'end': end,
                         'patchId': row.get('id', f'patch-{index+1:02d}')})
        cursor = end + 1
    if cursor < total:
        segments.append({'kind': 'base', 'start': cursor, 'end': total - 1})
    seams = []
    for index, (before, after) in enumerate(zip(segments, segments[1:]), 1):
        seam = after['start']
        require(before['end'] + 1 == seam, 'Gap in composed-segment plan.')
        samples = [{'offset': offset, 'frame': seam + offset,
                    'side': 'outgoing' if offset < 0 else 'incoming',
                    'clipId': clip_at(timeline, seam + offset)}
                   for offset in OFFSETS if 0 <= seam + offset < total]
        seams.append({'id': f'seam-{index:03d}', 'frame': seam,
                      'timeSeconds': seam / timeline['fps'],
                      'outgoing': before, 'incoming': after,
                      'samples': samples, 'visualReviewStatus': 'pending'})
    return seams


def font(size):
    for name in ['C:/Windows/Fonts/NotoSansSC-VF.ttf',
                 'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/arial.ttf']:
        if Path(name).is_file():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default(size=size)


def make_sheet(seam, run, video_sha, fps):
    width, height, gap, header, label = 640, 360, 14, 104, 46
    canvas = Image.new('RGB', (gap + 3 * (width + gap),
                              header + gap + 2 * (height + label + gap)), '#f2eee7')
    draw = ImageDraw.Draw(canvas)
    title = f"{seam['id']} | F{seam['frame']} | {seam['outgoing']['kind']} > {seam['incoming']['kind']}"
    draw.text((gap, 10), title, font=font(30), fill='#29484a')
    draw.text((gap, 51), f'FINAL MP4 SHA {video_sha[:24]} | visual review pending',
              font=font(24), fill='#29484a')
    for index, sample in enumerate(seam['samples']):
        x, y = gap + index % 3 * (width + gap), header + gap + index // 3 * (height + label + gap)
        with Image.open(run / 'frames' / f"frame-{sample['frame']:06d}.jpg") as image:
            canvas.paste(image.resize((width, height), Image.Resampling.LANCZOS), (x, y))
        offset = f"{sample['offset']:+d}"
        draw.text((x + 4, y + height + 6),
                  f"{offset}  F{sample['frame']} | {sample['frame']/fps:.3f}s | {sample['clipId']}",
                  font=font(23), fill='#29484a')
        if sample['offset'] == 0:
            draw.rectangle((x-2, y-2, x+width+1, y+height+1), outline='#367f83', width=3)
    x, y = gap + 2 * (width + gap), header + gap + height + label + gap
    draw.text((x + 10, y + 28), '0 = first incoming frame', font=font(27), fill='#29484a')
    draw.text((x + 10, y + 77), 'Offsets: -15 / -1 / 0 / +1 / +15', font=font(25), fill='#29484a')
    draw.text((x + 10, y + 131), 'Check: continuity, no flash,', font=font(25), fill='#29484a')
    draw.text((x + 10, y + 173), 'no object/opacity jump.', font=font(25), fill='#29484a')
    draw.text((x + 10, y + 237), 'No automated visual verdict.', font=font(25), fill='#29484a')
    target = run / f"{seam['id']}-F{seam['frame']:06d}.jpg"
    canvas.save(target, quality=94, subsampling=0)
    return {'path': rel(target), 'sha256': sha(target), 'seamId': seam['id'],
            'frames': [s['frame'] for s in seam['samples']], 'visualReviewStatus': 'pending'}


def lock_inputs(plan_path, plan, timeline):
    marker, qa = read(MARKER), read(MAIN_QA)
    hashes = {rel(path): sha(path) for path in
              (VIDEO, TIMELINE, MASTER, MARKER, MAIN_QA, plan_path, Path(__file__))}
    video_sha, plan_sha = hashes[rel(VIDEO)], hashes[rel(plan_path)]
    require(marker.get('success') is True and marker.get('singlePassRender') is False
            and bool(marker.get('composition')), 'Final marker must describe completed patch composition.')
    require(marker.get('frames') == [0, timeline['duration'] - 1], 'Final marker frame range differs.')
    require(Path(marker['outputLocation']).resolve() == VIDEO.resolve(), 'Marker identifies another movie.')
    require(marker.get('videoSHA256') == video_sha, 'Final marker video SHA is stale.')
    require(marker.get('planSHA256') == plan_sha, 'Final movie was composed from a different patch plan.')
    require(marker.get('baseRender', {}).get('videoSHA256') == plan.get('baseVideoSHA256'),
            'Final marker/plan base video mismatch.')
    require([[p['start'], p['end']] for p in marker.get('patches', [])] ==
            [[p['start'], p['end']] for p in plan['patches']], 'Final marker patch ranges differ.')
    for key, path in [('timelineSHA256', TIMELINE), ('masterSHA256', MASTER)]:
        require(marker.get(key) == hashes[rel(path)] == plan.get(key), f'{key} differs among locked inputs.')
    require(qa.get('automaticChecksPass') is True, 'Run successful qa_final.py --revision v5 first.')
    require(qa.get('videoSHA256') == video_sha, 'Automatic QA belongs to a different final movie.')
    require(qa.get('timelineSHA256') == hashes[rel(TIMELINE)], 'Automatic QA timeline SHA is stale.')
    require(qa.get('measured', {}).get('decodedFrames') == timeline['duration'], 'QA decoded frame count differs.')
    require(abs(qa.get('measured', {}).get('fps', 0) - timeline['fps']) < 1e-6, 'QA frame rate differs.')
    return hashes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, default=DEFAULT_PLAN)
    parser.add_argument('--describe-plan', action='store_true')
    args = parser.parse_args()
    plan_path = args.plan.resolve()
    require(plan_path.is_relative_to(ROOT), 'Plan must stay in this project.')
    plan, timeline = read(plan_path), read(TIMELINE)
    require(plan.get('timelineSHA256') == sha(TIMELINE), 'Plan timeline SHA is stale.')
    seams = build_seams(plan, timeline)
    frames = sorted({sample['frame'] for seam in seams for sample in seam['samples']})
    if args.describe_plan:
        print(json.dumps({'seams': len(seams), 'uniqueFrames': len(frames),
                          'offsets': OFFSETS, 'firstBoundary': seams[0]['frame'] if seams else None,
                          'lastBoundary': seams[-1]['frame'] if seams else None,
                          'opensVideo': False, 'writesFiles': False}, indent=2))
        return
    require(seams, 'No actual edit seams in this plan.')
    hashes = lock_inputs(plan_path, plan, timeline)
    video_sha = hashes[rel(VIDEO)]
    run = OUT / video_sha[:16]
    require(not run.exists(), f'Evidence output already exists; inspect it rather than overwrite: {run}')
    for parent in (OUT, OUT.parent):
        require(not parent.is_symlink(), f'Refusing linked evidence output: {parent}')
    ffmpeg = shutil.which('ffmpeg')
    require(ffmpeg, 'ffmpeg must be on PATH.')
    (run / 'frames').mkdir(parents=True)
    started = datetime.now(timezone.utc).isoformat()
    write(run / 'extraction-started.json', {'startedUTC': started, 'inputSHA256': hashes,
                                          'subjectiveReviewCompleted': False})
    expression = '+'.join(f'eq(n\\,{frame})' for frame in frames)
    with tempfile.TemporaryDirectory(prefix='extract-', dir=run) as temporary:
        folder = Path(temporary)
        command = [ffmpeg, '-hide_banner', '-nostdin', '-xerror', '-hwaccel', 'none',
                   '-threads', '2', '-i', str(VIDEO), '-map', '0:v:0', '-an',
                   '-vf', f'select={expression}', '-fps_mode', 'vfr', '-q:v', '2',
                   '-threads', '2', '-frames:v', str(len(frames)), '-start_number', '0',
                   '-y', str(folder / 'selected-%06d.jpg')]
        process = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        (run / 'ffmpeg-extraction.log').write_text(process.stderr, encoding='utf-8')
        require(process.returncode == 0, f'Frame extraction failed: {process.stderr[-1600:]}')
        images = sorted(folder.glob('selected-*.jpg'))
        require(len(images) == len(frames), f'Extracted {len(images)} frames; expected {len(frames)}.')
        for index, frame in enumerate(frames):
            image = folder / f'selected-{index:06d}.jpg'
            with Image.open(image) as decoded:
                require(decoded.size == (1920, 1080), f'Unexpected frame dimensions: {frame}')
            shutil.move(str(image), run / 'frames' / f'frame-{frame:06d}.jpg')
    sheets = [make_sheet(seam, run, video_sha, timeline['fps']) for seam in seams]
    records = [{'frame': frame, 'seconds': frame / timeline['fps'],
                'path': rel(run / 'frames' / f'frame-{frame:06d}.jpg'),
                'sha256': sha(run / 'frames' / f'frame-{frame:06d}.jpg')}
               for frame in frames]
    for relative, expected in hashes.items():
        require(sha(ROOT / relative) == expected, f'Input changed during extraction: {relative}')
    report = {'startedUTC': started, 'completedUTC': datetime.now(timezone.utc).isoformat(),
              'scope': 'Exact decoded frames from final composed MP4 around each edit. Stills do not certify continuous playback.',
              'inputSHA256': hashes, 'videoSHA256': video_sha, 'planSHA256': hashes[rel(plan_path)],
              'timelineSHA256': hashes[rel(TIMELINE)], 'offsets': OFFSETS,
              'seams': seams, 'frameRecords': records, 'contactSheets': sheets,
              'extractionCompleted': True, 'subjectiveReviewCompleted': False,
              'visualReviewStatus': 'pending', 'inputFilesModified': False,
              'decodePolicy': 'CPU FFmpeg, sequential decode from frame zero; no keyframe seeking or interpolation.'}
    write(run / 'manifest.json', report)
    print(json.dumps({'evidence': rel(run / 'manifest.json'), 'videoSHA256': video_sha,
                      'seams': len(seams), 'frames': len(frames), 'contactSheets': len(sheets),
                      'subjectiveReviewCompleted': False}, indent=2))


if __name__ == '__main__':
    main()
