"""Extract V6 focus-review frames from the final encoded, automatic-QA-locked MP4.

Read-only inputs; a fresh evidence directory is required. One CPU FFmpeg decode
selects absolute zero-based frame numbers and writes native JPGs plus SHA-256
checksums of each selected decoded YUV420p frame. Contact sheets contain at most
eight frames. Extraction never grants a visual pass.

Usage:
  python scripts/qa_focus_v6.py --describe-plan
  python scripts/qa_focus_v6.py
  python scripts/qa_focus_v6.py --extra-plan=research/revision-v6/hand-focus.json

Optional extra plan:
  {"version":"v6-focus-extra","groups":[
    {"id":"hand-reuse-entry","purpose":"Check reused hand entry.",
     "frames":[3300,3301,3302]}]}
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import shutil
import stat
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'delivery/GLP1_V5_1080p.mp4'
MARKER = ROOT / 'tmp/final-render.json'
MAIN_QA = ROOT / 'research/qa/final-v5/automatic-report.json'
TIMELINE = ROOT / 'src/timeline.json'
MASTER = ROOT / 'public/master.wav'
OUT = ROOT / 'research/qa/final-v5/focus-v6'
TIMELINE_SHA256 = 'e976021ce9b1a665ca54206e73898587efb33c6f91865eb22bb8b7ad0c71dfb0'
RENDER_MODE = 'single-complete-silent-remotion-render-with-locked-master-aac-mux'
FPS, TOTAL, WIDTH, HEIGHT = 30, 25621, 1920, 1080
REPARSE = getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)


def require(value, message):
    if not value:
        raise RuntimeError(message)


def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def rel(path):
    return path.relative_to(ROOT).as_posix()


def safe(value, exists=True):
    path = Path(value)
    path = Path(__import__('os').path.abspath(path if path.is_absolute() else ROOT / path))
    require(path != ROOT and path.is_relative_to(ROOT) and path.resolve().is_relative_to(ROOT),
            f'Path leaves project: {value}')
    for part in [path, *path.parents]:
        if part == ROOT:
            break
        if part.exists() or part.is_symlink():
            info = part.lstat()
            require(not stat.S_ISLNK(info.st_mode)
                    and not getattr(info, 'st_file_attributes', 0) & REPARSE,
                    f'Linked/reparse path refused: {part}')
    if exists:
        require(path.is_file() and path.stat().st_size > 0, f'Missing/empty input: {path}')
    return path


def read(path):
    return json.loads(safe(path).read_text(encoding='utf-8-sig'))


def write_new(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def group(identifier, purpose, frames):
    return {'id': identifier, 'purpose': purpose, 'frames': sorted(set(frames)),
            'visualReviewStatus': 'pending'}


def build_groups(extra):
    groups = [
        group('h070-scale-bridge', 'Track plaque-to-clot scale bridge and retained tissue context.',
              range(19610, 19761, 5)),
        group('h070-scale-bridge-dense', 'Inspect every frame through the formerly sparse scale bridge.',
              range(19660, 19687)),
        group('wardrobe-depth-order', 'Check the formerly unstable garment depth/opacity sequence.',
              range(3523, 3530)),
        group('blood-state-handoff', 'Check artery/flow/lesion state continuity at the former hard switch.',
              range(21332, 21343)),
        group('heart-return-first', 'Inspect cardiac return for near-lens surface facets and lost context.',
              range(20535, 20586, 5)),
        group('heart-return-second', 'Inspect second cardiac return for near-lens surfaces and opacity jumps.',
              range(21670, 21731, 5)),
        group('opening-fork-action', 'Review seated pose, hand/fork grip and opening action trajectory.',
              range(0, 301, 20)),
        group('opening-fork-handoff', 'Inspect exact frame297 handoff and later fork/meal action.',
              [295, 296, 297, 298, 299, 300, 350, 420, 480, 540]),
    ]
    if extra:
        require(extra.get('version') == 'v6-focus-extra', 'Unsupported extra-plan version')
        rows = extra.get('groups')
        require(isinstance(rows, list) and rows, 'Extra plan requires non-empty groups[]')
        for row in rows:
            require(isinstance(row, dict), 'Extra group must be an object')
            frames = row.get('frames')
            require(isinstance(frames, list) and frames and all(type(f) is int for f in frames),
                    'Extra group requires explicit integer frames[]')
            groups.append(group(row.get('id'), row.get('purpose'), frames))
    seen = set()
    for row in groups:
        require(isinstance(row['id'], str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,70}', row['id']),
                'Unsafe/invalid group id')
        require(row['id'] not in seen, 'Duplicate group id')
        seen.add(row['id'])
        require(isinstance(row['purpose'], str) and row['purpose'].strip(), 'Group needs a purpose')
        require(all(type(f) is int and 0 <= f < TOTAL for f in row['frames']), 'Frame outside timeline')
    return groups


def lock_inputs(extra_path=None):
    marker, qa, timeline = read(MARKER), read(MAIN_QA), read(TIMELINE)
    paths = [VIDEO, MARKER, MAIN_QA, TIMELINE, ROOT / 'public/timeline.json', MASTER, Path(__file__).resolve()]
    if extra_path:
        paths.append(extra_path)
    hashes = {rel(safe(path)): sha(path) for path in paths}
    video_sha = hashes[rel(VIDEO)]
    require(hashes[rel(TIMELINE)] == hashes['public/timeline.json'] == TIMELINE_SHA256,
            'Expected the frozen new V6 timeline e976021c, including public copy')
    require(timeline.get('duration') == TOTAL and timeline.get('fps') == FPS, 'Unexpected duration/fps')
    require(marker.get('success') is True and marker.get('singlePassRender') is True
            and marker.get('renderMode') == RENDER_MODE, 'Final marker is not a successful V6 full silent render')
    require(marker.get('frames') == [0, TOTAL - 1] and safe(marker['outputLocation']) == VIDEO,
            'Final marker frame range/output mismatch')
    require(marker.get('videoSHA256') == video_sha == qa.get('videoSHA256'),
            'Video, marker and automatic QA do not identify the same encoded film')
    require(marker.get('timelineSHA256') == TIMELINE_SHA256 == qa.get('timelineSHA256'),
            'Final marker/automatic QA timeline is stale')
    require(marker.get('masterSHA256') == hashes[rel(MASTER)], 'Final marker master is stale')
    require(qa.get('automaticChecksPass') is True and safe(qa.get('video', '')) == VIDEO,
            'Run successful final automatic QA first')
    measured = qa.get('measured', {})
    require(measured.get('decodedFrames') == TOTAL and measured.get('width') == WIDTH
            and measured.get('height') == HEIGHT and abs(measured.get('fps', 0) - FPS) < 1e-6,
            'Automatic QA video measurements differ')
    require(qa.get('checks', {}).get('fullDecodeSuccess') is True, 'Automatic full decode did not pass')
    runner = safe(marker.get('runner', ''))
    require(runner == ROOT / 'scripts/render_full_guarded_v6.mjs', 'Unexpected final render runner')
    require(sha(runner) == marker.get('runnerSHA256'), 'Runner source differs from final render')
    validation_path, lock_path = safe(marker['validation']), safe(marker['sourceLock'])
    for path, expected in [(validation_path, marker['validationSHA256']),
                           (lock_path, marker['sourceLockSHA256']), (runner, marker['runnerSHA256'])]:
        require(sha(path) == expected, f'Final render evidence changed: {rel(path)}')
        hashes[rel(path)] = expected
    validation, lock = read(validation_path), read(lock_path)
    require(validation.get('automaticChecksPass') is True and validation.get('fullDecodeSuccess') is True
            and validation.get('decodedFrames') == TOTAL, 'Runner validation incomplete')
    require(validation.get('audioComparison', {}).get('zeroLagVerified') is True
            and validation.get('audioComparison', {}).get('masterSHA256') == hashes[rel(MASTER)],
            'V6 runner did not validate the final zero-lag master')
    require(marker.get('audioMux', {}).get('videoPayloadUnchanged') is True,
            'V6 marker lacks verified silent-to-master video copy')
    lock_hashes = {item['path'].replace('\\', '/'): item['sha256'] for item in lock.get('files', [])}
    require(lock_hashes.get('src/timeline.json') == TIMELINE_SHA256
            and lock_hashes.get('public/master.wav') == hashes[rel(MASTER)],
            'Source lock does not bind final timeline/master')
    return hashes, timeline


def clip_at(timeline, frame):
    return next((c['id'] for c in timeline['clips'] if c['start'] <= frame < c['end']), 'opening-or-coda')


def font(size):
    for name in ['C:/Windows/Fonts/NotoSansSC-VF.ttf', 'C:/Windows/Fonts/msyh.ttc',
                 'C:/Windows/Fonts/arial.ttf']:
        if Path(name).is_file():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default(size=size)


def make_sheet(row, frames, index, run, video_sha, timeline):
    require(1 <= len(frames) <= 8, 'A contact sheet may contain at most eight frames')
    w, h, gap, head, label = 640, 360, 14, 110, 44
    cols = min(4, len(frames))
    rows = (len(frames) + cols - 1) // cols
    canvas = Image.new('RGB', (gap + cols * (w + gap), head + gap + rows * (h + label + gap)), '#f2eee7')
    draw = ImageDraw.Draw(canvas)
    draw.text((gap, 8), f"{row['id']} | sheet {index:02d} | final MP4 {video_sha[:16]}",
              font=font(27), fill='#29484a')
    draw.text((gap, 47), 'Visual review pending. Exact selected frames; no automatic visual verdict.',
              font=font(23), fill='#29484a')
    for i, frame in enumerate(frames):
        x, y = gap + i % cols * (w + gap), head + gap + i // cols * (h + label + gap)
        with Image.open(run / 'frames' / f'frame-{frame:06d}.jpg') as image:
            canvas.paste(image.resize((w, h), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 3, y + h + 6), f'F{frame:06d} | {frame/FPS:.3f}s | {clip_at(timeline, frame)}',
                  font=font(23), fill='#29484a')
    target = run / f"{row['id']}-sheet-{index:02d}.jpg"
    require(not target.exists(), 'Refusing to overwrite sheet')
    canvas.save(target, quality=94, subsampling=0)
    return {'path': rel(target), 'sha256': sha(target), 'groupId': row['id'],
            'purpose': row['purpose'], 'frames': frames, 'visualReviewStatus': 'pending'}


def parse_framehash(path, frames):
    lines = path.read_text(encoding='utf-8').splitlines()
    tb = next((line.split(':', 1)[1].strip() for line in lines if line.startswith('#tb 0:')), None)
    require(tb is not None, 'FFmpeg framehash lacks source-timebase evidence')
    timebase = Fraction(tb)
    rows = [line.split(',') for line in lines if line.strip() and not line.startswith('#')]
    require(len(rows) == len(frames), 'Decoded framehash count differs from selected frames')
    records = []
    for frame, row in zip(frames, rows):
        require(len(row) == 6, 'Unexpected FFmpeg framehash record')
        stream, dts, pts, duration, size = [int(x.strip()) for x in row[:5]]
        checksum = row[5].strip().lower()
        require(stream == 0 and Fraction(pts) * timebase == Fraction(frame, FPS),
                f'Decoded frame PTS does not match absolute frame {frame}')
        require(size == WIDTH * HEIGHT * 3 // 2 and re.fullmatch(r'[a-f0-9]{64}', checksum),
                'Unexpected raw YUV420p payload or SHA-256')
        records.append({'frame': frame, 'pts': pts, 'timeBase': tb,
                        'decodedYUV420pSHA256': checksum, 'decodedBytes': size})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--describe-plan', action='store_true')
    parser.add_argument('--extra-plan', type=Path)
    args = parser.parse_args()
    extra_path = safe(args.extra_plan) if args.extra_plan else None
    groups = build_groups(read(extra_path) if extra_path else None)
    frames = sorted({f for row in groups for f in row['frames']})
    if args.describe_plan:
        print(json.dumps({'groups': groups, 'uniqueFrames': len(frames),
                          'sheets': sum((len(g['frames']) + 7) // 8 for g in groups),
                          'lastSelectedFrame': frames[-1], 'timelineSHA256': TIMELINE_SHA256,
                          'opensVideo': False, 'writesFiles': False}, indent=2))
        return
    hashes, timeline = lock_inputs(extra_path)
    ffmpeg = shutil.which('ffmpeg')
    require(ffmpeg, 'FFmpeg must be on PATH')
    run = safe(OUT / hashes[rel(VIDEO)][:16], exists=False)
    require(not run.exists(), f'Evidence already exists; refusing overwrite: {run}')
    (run / 'frames').mkdir(parents=True)
    started = datetime.now(timezone.utc).isoformat()
    write_new(run / 'extraction-started.json', {'startedUTC': started, 'inputSHA256': hashes,
              'groups': groups, 'subjectiveReviewCompleted': False, 'visualReviewStatus': 'pending'})
    expression = '+'.join(f'eq(n\\,{frame})' for frame in frames)
    graph = f'[0:v:0]select={expression},split=2[jpg][rawhash]'
    rawhash = run / 'decoded-framehash.txt'
    command = [ffmpeg, '-hide_banner', '-nostdin', '-n', '-xerror', '-hwaccel', 'none',
               '-threads', '2', '-filter_complex_threads', '1', '-i', str(VIDEO),
               '-filter_complex', graph, '-map', '[jpg]', '-an', '-fps_mode', 'vfr',
               '-c:v', 'mjpeg', '-q:v', '2', '-threads', '2', '-frames:v', str(len(frames)),
               '-start_number', '0', str(run / 'frames' / 'selected-%06d.jpg'),
               '-map', '[rawhash]', '-an', '-fps_mode', 'passthrough', '-c:v', 'rawvideo',
               '-pix_fmt', 'yuv420p', '-threads', '1', '-f', 'framehash', '-hash', 'sha256',
               '-frames:v', str(len(frames)), str(rawhash)]
    write_new(run / 'command.json', {'command': command, 'selectedAbsoluteFrames': frames})
    process = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    (run / 'ffmpeg-extraction.log').write_text(process.stderr, encoding='utf-8')
    require(process.returncode == 0, f'CPU extraction failed: {process.stderr[-2000:]}')
    decoded = parse_framehash(rawhash, frames)
    selected = sorted((run / 'frames').glob('selected-*.jpg'))
    require(len(selected) == len(frames), 'JPG extraction count differs')
    records = []
    for i, (frame, raw) in enumerate(zip(frames, decoded)):
        source, target = run / 'frames' / f'selected-{i:06d}.jpg', run / 'frames' / f'frame-{frame:06d}.jpg'
        require(not target.exists(), 'Refusing to overwrite native frame')
        with Image.open(source) as image:
            require(image.size == (WIDTH, HEIGHT), f'Wrong native frame size: F{frame}')
        source.rename(target)
        frame_sha = sha(target)
        records.append({**raw, 'seconds': frame/FPS, 'clipId': clip_at(timeline, frame),
                        'path': rel(target), 'sha256': frame_sha, 'actualFrameSHA256': frame_sha,
                        'purposes': [{'groupId': g['id'], 'purpose': g['purpose']} for g in groups if frame in g['frames']],
                        'visualReviewStatus': 'pending'})
    sheets = []
    for row in groups:
        for index, offset in enumerate(range(0, len(row['frames']), 8), 1):
            sheets.append(make_sheet(row, row['frames'][offset:offset+8], index, run, hashes[rel(VIDEO)], timeline))
    for name, expected in hashes.items():
        require(sha(safe(name)) == expected, f'Input changed during extraction: {name}')
    report = {'startedUTC': started, 'completedUTC': datetime.now(timezone.utc).isoformat(),
              'scope': 'Selected final-encoded focus frames only; no automatic visual verdict.',
              'inputSHA256': hashes, 'videoSHA256': hashes[rel(VIDEO)],
              'timelineSHA256': TIMELINE_SHA256, 'groups': groups, 'frameRecords': records,
              'contactSheets': sheets, 'decodedFrameHashFile': rel(rawhash),
              'decodedFrameHashFileSHA256': sha(rawhash),
              'actualFrameSHA256Definition': 'SHA-256 of the native 1920x1080 extracted JPG; decodedYUV420pSHA256 separately records uncompressed selected pixels.',
              'extractionCompleted': True, 'subjectiveReviewCompleted': False,
              'visualReviewStatus': 'pending', 'inputFilesModified': False,
              'decodePolicy': 'One CPU FFmpeg sequential pass from frame0 to the last selection; exact select(n), original PTS cross-check, no seek, frame interpolation or audio decode.'}
    write_new(run / 'manifest.json', report)
    print(json.dumps({'manifest': rel(run / 'manifest.json'), 'videoSHA256': hashes[rel(VIDEO)],
                      'groups': len(groups), 'frames': len(frames), 'sheets': len(sheets),
                      'subjectiveReviewCompleted': False, 'visualReviewStatus': 'pending'}, indent=2))


if __name__ == '__main__':
    main()

