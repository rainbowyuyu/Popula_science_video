"""Measure the finished delivery and extract actual encoded frames for visual review.

No source-video edits. With --wait, readiness is checked silently once per 60 s.
Automated measurements never certify a full human audiovisual viewing.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import time

from PIL import Image, ImageDraw, ImageFont, JpegImagePlugin, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'delivery/GLP1_1080p.mp4'
MARKER = ROOT / 'tmp/final-render.json'
OUT = ROOT / 'research/qa/final'
EXPECTED = {'width': 1920, 'height': 1080, 'fps': 30}
OFFSETS = [-45, -20, 0, 20, 45]
MICRO_IDS = ['g012', 'g013', 'g016', 'g025', 'g027', 'g028', 'g029']


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def ready():
    if not MARKER.exists() or not VIDEO.exists() or not VIDEO.stat().st_size:
        return False
    try:
        marker = json.loads(MARKER.read_text(encoding='utf-8'))
        timeline_file = ROOT / 'src/timeline.json'
        timeline = json.loads(timeline_file.read_text(encoding='utf-8'))
        return (marker.get('success') is True
                and marker.get('frames') == [0, timeline['duration'] - 1]
                and marker.get('timelineSHA256') == sha(timeline_file))
    except (OSError, json.JSONDecodeError):
        return False


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


class Runner:
    def __init__(self):
        self.commands = []

    def run(self, name, args, accept_failure=False):
        print(f'QA {name}', flush=True)
        started = now()
        clock = time.monotonic()
        process = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
        (OUT / f'{name}.stdout.txt').write_text(process.stdout, encoding='utf-8')
        (OUT / f'{name}.stderr.txt').write_text(process.stderr, encoding='utf-8')
        self.commands.append({'name': name, 'command': args, 'startedAtUTC': started,
                              'seconds': round(time.monotonic() - clock, 3), 'exitCode': process.returncode})
        write_json(OUT / 'commands.json', self.commands)
        if process.returncode and not accept_failure:
            raise RuntimeError(f'{name} failed with {process.returncode}: {process.stderr[-1200:]}')
        return process


def font(size):
    for path in [Path('C:/Windows/Fonts/msyh.ttc'), Path('C:/Windows/Fonts/arial.ttf')]:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def contact(path, title, items, columns=2, width=640):
    """Each item is a frame number and an independently readable provenance label."""
    gap = 14
    label_height = 42 if width >= 600 else 33
    image_height = round(width * 9 / 16)
    header = 66
    rows = math.ceil(len(items) / columns)
    canvas = Image.new('RGB', (gap + columns * (width + gap),
                              header + gap + rows * (image_height + label_height + gap)), '#f2eee7')
    draw = ImageDraw.Draw(canvas)
    draw.text((gap, 14), title, fill='#29484a', font=font(30))
    for index, (frame, label) in enumerate(items):
        x = gap + (index % columns) * (width + gap)
        y = header + gap + (index // columns) * (image_height + label_height + gap)
        with Image.open(OUT / 'frames' / f'frame-{frame:06d}.jpg') as original:
            canvas.paste(original.resize((width, image_height), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 4, y + image_height + 5), label, fill='#29484a', font=font(25 if width >= 600 else 20))
    canvas.save(path, quality=93, subsampling=0)


def build_plan(timeline):
    fps = timeline['fps']
    total = timeline['duration']
    clamp = lambda frame: max(0, min(total - 1, int(frame)))
    plan = defaultdict(list)
    representatives = []
    section_boundaries = []
    micro_boundaries = []
    handoffs = []
    zoom_windows = []
    for clip in timeline['clips']:
        frame = clamp(math.floor(clip['start'] + clip['duration'] * .7))
        representatives.append({'id': clip['id'], 'section': clip['section'], 'frame': frame,
                                'timeSeconds': frame / fps, 'caption': clip['caption']})
        plan[frame].append(f"representative:{clip['id']}:70percent")
        handoff = {'id': clip['id'], 'frames': []}
        for offset in [-15, 15]:
            at = clamp(clip['start'] + offset)
            handoff['frames'].append(at)
            plan[at].append(f"handoff:{clip['id']}:{offset:+d}")
        handoffs.append(handoff)
        if clip['id'] in MICRO_IDS:
            window = {'id': clip['id'], 'frames': []}
            for portion in [.15, .35, .55, .75, .95]:
                at = clamp(clip['start'] + clip['duration'] * portion)
                window['frames'].append(at)
                plan[at].append(f"progress:{clip['id']}:{portion:.0%}")
            zoom_windows.append(window)
    seen = set()
    for section in timeline['sections']:
        for edge in ['start', 'end']:
            center = section[edge]
            if center in seen:
                continue
            seen.add(center)
            row = {'label': f"section:{section['id']}:{edge}", 'center': center, 'frames': []}
            for offset in OFFSETS:
                frame = clamp(center + offset)
                row['frames'].append({'offset': offset, 'frame': frame})
                plan[frame].append(f"{row['label']}:{offset:+d}")
            section_boundaries.append(row)
    for clip in timeline['clips']:
        if clip['id'] not in MICRO_IDS:
            continue
        for edge in ['start', 'end']:
            center = clip[edge]
            row = {'label': f"micro:{clip['id']}:{edge}", 'center': center, 'frames': []}
            for offset in OFFSETS:
                frame = clamp(center + offset)
                row['frames'].append({'offset': offset, 'frame': frame})
                plan[frame].append(f"{row['label']}:{offset:+d}")
            micro_boundaries.append(row)
    coda_start = timeline['clips'][-1]['end']
    coda = [clamp(coda_start + offset) for offset in [0, 20, 45, 90, 180, total-coda_start-1]]
    for frame in coda:
        plan[frame].append('paper_coda')
    repair_windows = []
    if total == 20288:
        for name, start, end in [('islet-transparency-entry', 4130, 4490), ('islet-transparency-exit', 5727, 5760), ('lipid-scale-context', 6785, 7100), ('lipid-scale-exit', 7690, 7890), ('artery-wall-reveal', 11780, 12530), ('aorta-label-reveal', 7985, 8120), ('pose-label-reveal', 16775, 16955)]:
            row = {'name': name, 'frames': list(range(start, end + 1, 15))}
            if name.startswith('islet-transparency'):
                row['frames'] = sorted(set(row['frames'] + [f for f in [4130,4131,4151,4152,4153,4154,4481,4482,5727,5728,5747,5748,5749,5750,5753,5754] if start <= f <= end]))
            repair_windows.append(row)
            for frame in row['frames']:
                plan[frame].append('repair-window:' + name)
        joins = {'name': 'splice-boundaries', 'frames': []}
        patch_plan = json.loads((ROOT / 'research/revision-v4/patches/patch-plan.json').read_text(encoding='utf-8'))
        for edge in [edge for patch in patch_plan['patches'] for edge in (patch['start'], patch['end']+1)]:
            for offset in [-1, 0, 1]:
                joins['frames'].append(edge + offset)
                plan[edge + offset].append('repair-splice-boundary')
        repair_windows.append(joins)
    plan[0].append('first_frame')
    plan[total - 1].append('last_frame')
    return {'fps': fps, 'durationFrames': total, 'representatives': representatives,
            'sectionBoundaries': section_boundaries, 'microBoundaries': micro_boundaries,
            'handoffs': handoffs, 'zoomWindows': zoom_windows, 'repairWindows': repair_windows,
            'codaFrames': coda, 'frames': [{'frame': f, 'timeSeconds': f / fps, 'reasons': plan[f]}
                                        for f in sorted(plan)]}


def main():
    global OUT, MICRO_IDS, VIDEO
    parser = argparse.ArgumentParser()
    parser.add_argument('--wait', action='store_true', help='Silently check readiness once per 60 seconds.')
    parser.add_argument('--revision', default='v3', choices=['v3', 'v4', 'v5'])
    args = parser.parse_args()
    if args.revision == 'v4':
        OUT = ROOT / 'research/qa/final-v4'
        MICRO_IDS = ['g011','g014','g016','g018','g021','g022','g026','g030','g032','g036','g044','g045','g046','g060']
    if args.revision == 'v5':
        OUT = ROOT / 'research/qa/final-v5'
        VIDEO = ROOT / 'delivery/GLP1_V5_1080p.mp4'
        MICRO_IDS = ['h008','h009','h014','h020','h021','h022','h023','h025','h033','h035','h042','h051','h058','h059','h062','h070','h073','h074']
    if args.wait and not ready():
        print('WAITING for successful final-render.json and completed delivery; checks every 60 seconds.', flush=True)
        while not ready():
            time.sleep(60)
    if not ready():
        print('NOT_READY: final-render.json success and final delivery are both required.', flush=True)
        return 3
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'frames').mkdir(exist_ok=True)
    (OUT / 'contacts').mkdir(exist_ok=True)
    ffmpeg = shutil.which('ffmpeg')
    ffprobe = shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        raise RuntimeError('ffmpeg and ffprobe must be installed.')
    runner = Runner()
    started = now()
    timeline = json.loads((ROOT / 'src/timeline.json').read_text(encoding='utf-8'))
    marker = json.loads(MARKER.read_text(encoding='utf-8'))
    if marker.get('timelineSHA256') != sha(ROOT / 'src/timeline.json') or marker.get('videoSHA256') != sha(VIDEO):
        raise RuntimeError('Render marker does not match current video and timeline.')
    EXPECTED.update(frames=timeline['duration'],duration=timeline['duration']/timeline['fps'])
    write_json(OUT / 'render-marker.json', json.loads(MARKER.read_text(encoding='utf-8')))
    probe = runner.run('ffprobe', [ffprobe, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(VIDEO)])
    metadata = json.loads(probe.stdout)
    write_json(OUT / 'ffprobe.json', metadata)
    video = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in metadata['streams'] if s['codec_type'] == 'audio')
    decode = runner.run('decode-blackdetect', [ffmpeg, '-hide_banner', '-nostdin', '-xerror', '-i', str(VIDEO),
        '-map', '0:v:0', '-map', '0:a:0', '-vf', 'blackdetect=d=0.12:pix_th=0.02:pic_th=0.98',
        '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], accept_failure=True)
    frames = [int(x) for x in re.findall(r'^frame=(\d+)\s*$', decode.stdout, re.M)]
    black = [{'start': float(a), 'end': float(b), 'duration': float(c)} for a, b, c in re.findall(
        r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)', decode.stderr)]
    measured = runner.run('aac-loudnorm', [ffmpeg, '-hide_banner', '-nostdin', '-i', str(VIDEO), '-vn',
        '-map', '0:a:0', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
    matches = re.findall(r'\{\s*"input_i"[\s\S]*?\}', measured.stderr)
    if not matches:
        raise RuntimeError('No loudnorm input measurement found.')
    loudnorm = json.loads(matches[-1])
    write_json(OUT / 'aac-loudnorm.json', loudnorm)
    plan = build_plan(timeline)
    write_json(OUT / 'frame-manifest.json', plan)
    selected = [row['frame'] for row in plan['frames']]
    expression = '+'.join(f'eq(n\\,{frame})' for frame in selected)
    runner.run('extract-final-frames', [ffmpeg, '-hide_banner', '-nostdin', '-i', str(VIDEO),
        '-an', '-vf', f'select={expression}', '-fps_mode', 'vfr', '-q:v', '2',
        '-start_number', '0', '-y', str(OUT / 'frames' / 'selected-%06d.jpg')])
    for i, frame in enumerate(selected):
        temporary = OUT / 'frames' / f'selected-{i:06d}.jpg'
        if not temporary.exists():
            raise RuntimeError(f'Missing selected frame {i} for source frame {frame}.')
        temporary.replace(OUT / 'frames' / f'frame-{frame:06d}.jpg')
    contacts = []
    for page in range(0, len(plan['handoffs']), 5):
        rows = plan['handoffs'][page:page+5]
        dest = OUT / 'contacts' / f'all-handoffs-{page//5+1:02d}.jpg'
        contact(dest, 'FINAL MP4 | every clip boundary, before / after',
                [(f, f"{row['id']} | F{f}") for row in rows for f in row['frames']])
        contacts.append(str(dest.relative_to(ROOT)))
    for row in plan['zoomWindows']:
        dest = OUT / 'contacts' / f'zoom-{row["id"]}.jpg'
        contact(dest, f'FINAL MP4 | {row["id"]} | 15 / 35 / 55 / 75 / 95%',
                [(f, f'F{f} | {f/timeline["fps"]:.2f}s') for f in row['frames']])
        contacts.append(str(dest.relative_to(ROOT)))
    for row in plan['repairWindows']:
        for page in range(0, len(row['frames']), 8):
            dest = OUT / 'contacts' / f'repair-{row["name"]}-{page//8+1:02d}.jpg'
            contact(dest, 'FINAL MP4 | splice boundary before/current/after' if row['name']=='splice-boundaries' else 'FINAL MP4 | repair window | every 0.5 seconds',
                    [(f, f'F{f} | {f/timeline["fps"]:.2f}s') for f in row['frames'][page:page+8]])
            contacts.append(str(dest.relative_to(ROOT)))
    for i, section in enumerate(timeline['sections'], 1):
        rows = [x for x in plan['representatives'] if section['start'] <= x['frame'] < section['end']]
        for page in range(0, len(rows), 6):
            items = [(x['frame'], f"{x['id']} | F{x['frame']:04d} | {x['timeSeconds']:.2f}s") for x in rows[page:page+6]]
            dest = OUT / 'contacts' / f'representatives-{i:02d}-{section["id"]}-{page//6+1}.jpg'
            contact(dest, f'FINAL MP4 | {section["id"]} | 70% of each clip', items)
            contacts.append(str(dest.relative_to(ROOT)))
    for kind in ['sectionBoundaries', 'microBoundaries']:
        rows = plan[kind]
        for page in range(0, len(rows), 3):
            items = [(x['frame'], f"{row['label']} {x['offset']:+d} F{x['frame']}")
                     for row in rows[page:page+3] for x in row['frames']]
            dest = OUT / 'contacts' / f'{kind}-{page//3+1:02d}.jpg'
            contact(dest, f'FINAL MP4 | {kind} | offsets -45 / -20 / 0 / +20 / +45', items,
                    columns=5, width=384)
            contacts.append(str(dest.relative_to(ROOT)))
    focused = [x for x in plan['representatives'] if x['id'] in MICRO_IDS]
    for page in range(0, len(focused), 6):
        dest = OUT / 'contacts' / f'microscopic-focus-{page//6+1}.jpg'
        contact(dest, 'FINAL MP4 | microscopic scenes', [(x['frame'], f"{x['id']} | {x['timeSeconds']:.2f}s")
                                                         for x in focused[page:page+6]])
        contacts.append(str(dest.relative_to(ROOT)))
    coda_dest = OUT / 'contacts' / 'paper-coda.jpg'
    contact(coda_dest, 'FINAL MP4 | paper coda entrance and hold',
            [(f, f'F{f} | {f/timeline["fps"]:.2f}s') for f in plan['codaFrames']])
    contacts.append(str(coda_dest.relative_to(ROOT)))
    final_frames = int(video.get('nb_frames', frames[-1] if frames else 0))
    fps = float(Fraction(video['avg_frame_rate']))
    duration = float(video.get('duration', metadata['format']['duration']))
    checks = {
        'width1920': video['width'] == EXPECTED['width'], 'height1080': video['height'] == EXPECTED['height'],
        'fps30': abs(fps - EXPECTED['fps']) < .0001, 'framesMatchTimeline': final_frames == EXPECTED['frames'],
        'videoDurationMatchesTimeline': abs(duration - EXPECTED['duration']) <= 1/EXPECTED['fps'],
        'fullDecodeSuccess': decode.returncode == 0,
        'decodedFramesMatchTimeline': bool(frames) and frames[-1] == EXPECTED['frames'],
        'audioAAC': audio['codec_name'] == 'aac',
        'colorBT709': all(video.get(k)=='bt709' for k in ['color_space','color_transfer','color_primaries']),
        'noDetectedBlackSegments': not black,
        'aacTruePeakBelow0dBTP': float(loudnorm['input_tp']) < 0,
        'allRepresentativeClipsExtracted': len(plan['representatives']) == len(timeline['clips']),
        'allPlannedFramesExist': all((OUT/'frames'/f'frame-{f:06d}.jpg').exists() for f in selected),
    }
    report = {'startedAtUTC': started, 'finishedAtUTC': now(), 'video': str(VIDEO),
        'videoSHA256': sha(VIDEO), 'videoBytes': VIDEO.stat().st_size,
        'timelineSHA256': sha(ROOT/'src/timeline.json'), 'expected': EXPECTED,
        'measured': {'width': video['width'], 'height': video['height'], 'fps': fps,
            'metadataFrames': final_frames, 'decodedFrames': frames[-1] if frames else None,
            'videoDurationSeconds': duration, 'containerDurationSeconds': float(metadata['format']['duration']),
            'videoCodec': video['codec_name'], 'pixelFormat': video.get('pix_fmt'),
            'audioCodec': audio['codec_name'], 'audioSampleRate': audio.get('sample_rate'),
            'aacIntegratedLUFS': float(loudnorm['input_i']), 'aacTruePeakDBTP': float(loudnorm['input_tp']),
            'aacLoudnessRangeLU': float(loudnorm['input_lra'])},
        'checks': checks, 'automaticChecksPass': all(checks.values()),
        'blackDetection': {'minDurationSeconds': .12, 'pixelThreshold': .02, 'pictureBlackRatio': .98, 'segments': black,
            'note': 'Detects near-black pictures only; intentionally still paper coda is not treated as an error.'},
        'framesExtracted': len(selected), 'representatives': len(timeline['clips']), 'contactSheets': contacts,
        'manualVisualReviewCompleted': False,
        'scope': 'The entire file was decoded automatically. Frames are extracted from the final encoded MP4. '
                 'No claim of frame-by-frame or full-duration human viewing is made. AAC input loudnorm values '
                 'measure the delivered audio, not the pre-encode mix.'}
    write_json(OUT / 'automatic-report.json', report)
    markdown = ['# 最终MP4自动检查', '', f'文件：{VIDEO}', f'UTC：{report["finishedAtUTC"]}', '',
                f'自动检查全部通过：{report["automaticChecksPass"]}', '', '| 检查 | 实测 |', '|---|---|']
    markdown += [f'| {k} | {v} |' for k,v in report['measured'].items()]
    markdown += ['', f'黑场段：{len(black)}；抽取唯一帧：{len(selected)}；{len(timeline["clips"])}句均有70%代表帧。', '',
                 '完整解码、黑场检测、AAC响度为自动检测；目视检查记录另存visual-review.md，不能据此声称人工逐秒看完。']
    (OUT / 'automatic-report.md').write_text('\n'.join(markdown), encoding='utf-8')
    print(json.dumps({'automaticChecksPass': report['automaticChecksPass'], 'measured': report['measured'],
                      'blackSegments': black, 'framesExtracted': len(selected), 'contactSheets': len(contacts)},
                     ensure_ascii=False), flush=True)
    return 0 if report['automaticChecksPass'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
