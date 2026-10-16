"""Extract the V2 motion-review plan from the completed, SHA-verified MP4.

Run only after qa_final.py succeeds. Reads source, render marker and main QA;
writes exclusively to research/qa/final-motion. No rendering or bundling.
One ffmpeg select pass extracts every planned frame. Contact sheets prepare
visual review; successful extraction does not certify human motion review.
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
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'research/revision-v2/motion-review-plan.json'
TIMELINE = ROOT / 'src/timeline.json'
VIDEO = ROOT / 'delivery/GLP1_1080p.mp4'
MARKER = ROOT / 'tmp/final-render.json'
MAIN_QA = ROOT / 'research/qa/final/automatic-report.json'
OUT = ROOT / 'research/qa/final-motion'
LOCKED_TIMELINE_SHA256 = 'aecb1dd5b85f16088bb870c1082c7feabe325cf64af3f52fcff97ed3d8f0240c'
EXPECTED_FRAMES = 9776
EXPECTED_FPS = 30
ACTIVE_RUN = {}


class GateError(RuntimeError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def read_json(path):
    if not path.is_file():
        raise GateError(f'Required input is missing: {path}')
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as error:
        raise GateError(f'Cannot read JSON input {path}: {error}') from error


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def require(condition, message):
    if not condition:
        raise GateError(message)


def file_state(path):
    stat = path.stat()
    return {'bytes': stat.st_size, 'mtimeNS': stat.st_mtime_ns}


def run_command(args):
    return subprocess.run(args, capture_output=True, text=True,
                          encoding='utf-8', errors='replace')


def validate_inputs(expected_sha):
    """All readiness gates run before output creation or video extraction."""
    plan, timeline = read_json(PLAN), read_json(TIMELINE)
    marker, main_qa = read_json(MARKER), read_json(MAIN_QA)
    require(VIDEO.is_file() and VIDEO.stat().st_size > 0, 'Final MP4 is missing or empty.')
    require(marker.get('success') is True, 'Final render marker is not successful.')
    require(marker.get('frames') == [0, EXPECTED_FRAMES - 1],
            'Marker must cover exactly frames 0–9775; old or partial renders are rejected.')
    require(bool(marker.get('finished')), 'Final marker has no completion timestamp.')
    require(Path(marker.get('outputLocation', '')).resolve() == VIDEO.resolve(),
            'Render marker points to a different MP4.')
    timeline_sha = sha(TIMELINE)
    require(timeline_sha == LOCKED_TIMELINE_SHA256 == plan.get('source', {}).get('timelineSHA256'),
            'Timeline SHA-256 does not match the frozen V2 plan.')
    require(timeline.get('duration') == EXPECTED_FRAMES and timeline.get('fps') == EXPECTED_FPS,
            'Timeline must contain 9776 frames at 30 fps.')
    require(plan.get('source', {}).get('durationFrames') == EXPECTED_FRAMES
            and plan.get('source', {}).get('fps') == EXPECTED_FPS,
            'Motion plan has an unexpected duration or frame rate.')
    require(main_qa.get('automaticChecksPass') is True,
            'Run qa_final.py successfully before this supplementary extraction.')
    require(main_qa.get('timelineSHA256') == timeline_sha,
            'Main QA report belongs to a different timeline.')
    require(Path(main_qa.get('video', '')).resolve() == VIDEO.resolve(),
            'Main QA report belongs to a different video path.')

    # Pin the encoded artifact to the already completed main QA. Hashing is a
    # file read; neither ffprobe metadata nor this check decodes a second time.
    input_state = file_state(VIDEO)
    video_sha = sha(VIDEO)
    require(file_state(VIDEO) == input_state, 'MP4 changed while computing SHA-256.')
    require(video_sha == main_qa.get('videoSHA256'),
            'MP4 SHA-256 differs from main QA; rerun main QA for the completed delivery.')
    if expected_sha:
        require(video_sha == expected_sha.lower(), 'MP4 does not match --expected-sha256.')

    windows = plan.get('windows', [])
    require(bool(windows), 'Motion plan has no windows.')
    ids = [window.get('id') for window in windows]
    require(all(isinstance(value, str) and re.fullmatch(r'[a-z0-9_]+', value) for value in ids),
            'Window IDs must be safe lowercase filename components.')
    require(len(set(ids)) == len(ids), 'Motion window IDs are duplicated.')
    requested = []
    for window in windows:
        frames = window.get('frames', [])
        require(len(frames) == 12 and all(type(frame) is int for frame in frames),
                f'{window["id"]}: expected 12 integer frame numbers.')
        require(all(0 <= frame < EXPECTED_FRAMES for frame in frames),
                f'{window["id"]}: a requested frame is outside the encoded range.')
        require(all(b - a == 10 for a, b in zip(frames, frames[1:])),
                f'{window["id"]}: expected evenly spaced frames with step 10.')
        require(frames[0] == window.get('startFrame') and frames[-1] == window.get('endFrame'),
                f'{window["id"]}: frame list and start/end disagree.')
        require(60 <= frames[-1] - frames[0] <= 120,
                f'{window["id"]}: expected a 2–4 second review window.')
        requested.extend(frames)
    selected = sorted(set(requested))
    require(selected == [row.get('frame') for row in plan.get('frames', [])],
            'Top-level frame list does not match the union of window frames.')
    require(len(selected) == plan.get('sampling', {}).get('uniqueFrameCount'),
            'Motion plan unique-frame count is inconsistent.')

    ffprobe, ffmpeg = shutil.which('ffprobe'), shutil.which('ffmpeg')
    require(bool(ffprobe and ffmpeg), 'ffprobe and ffmpeg must be on PATH.')
    probe_args = [ffprobe, '-v', 'error', '-select_streams', 'v:0',
                  '-show_streams', '-show_format', '-of', 'json', str(VIDEO)]
    probe = run_command(probe_args)
    require(probe.returncode == 0, f'ffprobe failed: {probe.stderr[-1000:]}')
    metadata = json.loads(probe.stdout)
    streams = metadata.get('streams', [])
    require(len(streams) == 1, 'Expected one selected video stream.')
    video = streams[0]
    require(str(video.get('nb_frames')) == str(EXPECTED_FRAMES),
            'MP4 metadata must report exactly 9776 frames; no extra count_frames decode is performed.')
    require(Fraction(video.get('avg_frame_rate', '0/1')) == EXPECTED_FPS,
            'MP4 must be exactly 30 fps.')
    require(video.get('width') == 1920 and video.get('height') == 1080,
            'Expected the 1920×1080 final delivery.')
    duration = float(video.get('duration', metadata['format'].get('duration', 0)))
    require(abs(duration - EXPECTED_FRAMES / EXPECTED_FPS) <= 1 / EXPECTED_FPS,
            'Encoded duration does not match the V2 timeline.')
    require(file_state(VIDEO) == input_state, 'MP4 changed during readiness checks.')
    return {'plan': plan, 'timeline': timeline, 'marker': marker, 'mainQA': main_qa,
            'selected': selected, 'inputState': input_state, 'videoSHA256': video_sha,
            'timelineSHA256': timeline_sha, 'planSHA256': sha(PLAN), 'markerSHA256': sha(MARKER),
            'mainQASHA256': sha(MAIN_QA), 'ffmpeg': ffmpeg, 'metadata': metadata,
            'probeCommand': probe_args}


def font(size):
    for path in ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/arial.ttf']:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def clip_at(timeline, frame):
    return next((clip['id'] for clip in timeline['clips']
                 if clip['start'] <= frame < clip['end']), 'references')


def contact_sheet(window, timeline, video_sha):
    width, height, columns, rows = 480, 270, 4, 3
    gap, header, label_height = 14, 88, 36
    canvas = Image.new('RGB', (gap + columns * (width + gap),
                              header + gap + rows * (height + label_height + gap)), '#f2eee7')
    draw = ImageDraw.Draw(canvas)
    draw.text((gap, 9), f'V2 FINAL MP4 | {window["title"]}', fill='#29484a', font=font(28))
    draw.text((gap, 49), f'F{window["startFrame"]}–F{window["endFrame"]} | '
              f'30 fps | SHA-256 {video_sha}', fill='#29484a', font=font(18))
    for index, frame in enumerate(window['frames']):
        x = gap + index % columns * (width + gap)
        y = header + gap + index // columns * (height + label_height + gap)
        with Image.open(OUT / 'frames' / f'frame-{frame:06d}.jpg') as source:
            canvas.paste(source.convert('RGB').resize((width, height), Image.Resampling.LANCZOS), (x, y))
        label = f'F{frame:05d} | {frame / EXPECTED_FPS:.3f}s | {clip_at(timeline, frame)}'
        draw.text((x + 4, y + height + 5), label, fill='#29484a', font=font(20))
    dest = OUT / 'contacts' / f'{window["id"]}.jpg'
    canvas.save(dest, quality=95, subsampling=0)
    return dest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-sha256', help='Optional additional SHA-256 pin for the final MP4.')
    args = parser.parse_args()
    if args.expected_sha256 and not re.fullmatch(r'[0-9a-fA-F]{64}', args.expected_sha256):
        parser.error('--expected-sha256 must contain exactly 64 hexadecimal characters')
    started = now()
    inputs = validate_inputs(args.expected_sha256)
    for directory in [OUT, OUT / 'frames', OUT / 'contacts']:
        directory.mkdir(parents=True, exist_ok=True)
    ACTIVE_RUN.update(startedAtUTC=started, videoSHA256=inputs['videoSHA256'])
    # A fresh temporary directory prevents leftover sequential files from a
    # previous extraction being mistaken for frames produced by this command.
    temporary = Path(tempfile.mkdtemp(prefix='extract-', dir=OUT))
    write_json(OUT / 'run-status.json', {'status': 'extracting', 'startedAtUTC': started,
                                      'videoSHA256': inputs['videoSHA256'], 'temporaryDirectory': str(temporary)})
    write_json(OUT / 'input-ffprobe.json', inputs['metadata'])
    write_json(OUT / 'input-render-marker.json', inputs['marker'])
    write_json(OUT / 'input-plan.json', inputs['plan'])
    expression = '+'.join(f'eq(n\\,{frame})' for frame in inputs['selected'])
    command = [inputs['ffmpeg'], '-hide_banner', '-nostdin', '-xerror', '-i', str(VIDEO),
               '-map', '0:v:0', '-an', '-vf', f'select={expression}', '-fps_mode', 'vfr',
               '-q:v', '2', '-start_number', '0', '-y', str(temporary / 'selected-%06d.jpg')]
    print(f'Extracting {len(inputs["selected"])} encoded frames in one select pass.', flush=True)
    extraction = run_command(command)
    (OUT / 'extract.stdout.txt').write_text(extraction.stdout, encoding='utf-8')
    (OUT / 'extract.stderr.txt').write_text(extraction.stderr, encoding='utf-8')
    write_json(OUT / 'commands.json', [{'name': 'ffprobe-metadata', 'command': inputs['probeCommand']},
                                     {'name': 'extract-motion-frames', 'command': command,
                                      'exitCode': extraction.returncode}])
    if extraction.returncode:
        raise RuntimeError(f'ffmpeg failed with {extraction.returncode}: {extraction.stderr[-1000:]}')
    files = sorted(temporary.glob('selected-*.jpg'))
    require(len(files) == len(inputs['selected']), 'ffmpeg did not produce exactly the planned number of frames.')
    require(file_state(VIDEO) == inputs['inputState'], 'MP4 changed during extraction; outputs cannot be accepted.')
    require(sha(VIDEO) == inputs['videoSHA256'], 'MP4 SHA-256 changed during extraction.')
    require(sha(TIMELINE) == inputs['timelineSHA256'] and sha(PLAN) == inputs['planSHA256'],
            'Timeline or sampling plan changed during extraction.')
    require(sha(MARKER) == inputs['markerSHA256'] and sha(MAIN_QA) == inputs['mainQASHA256'],
            'Render marker or main QA changed during extraction.')

    frame_rows = []
    for index, frame in enumerate(inputs['selected']):
        source = temporary / f'selected-{index:06d}.jpg'
        require(source.is_file(), f'Missing sequential extraction frame {index}.')
        with Image.open(source) as img:
            require(img.size == (1920, 1080), f'F{frame}: unexpected extracted resolution {img.size}.')
        dest = OUT / 'frames' / f'frame-{frame:06d}.jpg'
        source.replace(dest)
        frame_rows.append({'frame': frame, 'timeSeconds': frame / EXPECTED_FPS,
                           'clip': clip_at(inputs['timeline'], frame), 'path': str(dest.relative_to(ROOT)),
                           'sha256': sha(dest), 'windows': [window['id'] for window in inputs['plan']['windows']
                                                         if frame in window['frames']]})
    temporary.rmdir()  # Only this now-empty extraction directory is removed.
    window_rows = []
    for window in inputs['plan']['windows']:
        sheet = contact_sheet(window, inputs['timeline'], inputs['videoSHA256'])
        window_rows.append({**window, 'contactSheetPath': str(sheet.relative_to(ROOT)),
                            'contactSheetSHA256': sha(sheet), 'visualReviewStatus': 'pending'})
    report = {'status': 'ready-for-visual-review', 'startedAtUTC': started, 'finishedAtUTC': now(),
              'video': str(VIDEO), 'videoSHA256': inputs['videoSHA256'],
              'videoBytes': inputs['inputState']['bytes'], 'timelineSHA256': inputs['timelineSHA256'],
              'planSHA256': inputs['planSHA256'], 'mainQAReadOnlyPath': str(MAIN_QA),
              'mainQASHA256': inputs['mainQASHA256'], 'markerSHA256': inputs['markerSHA256'],
              'gates': {'markerSuccess': True, 'markerCovers9776Frames': True,
                        'frozenV2TimelineSHA256': True, 'mainQAPassed': True,
                        'inputSHAMatchesMainQA': True, 'metadata9776Frames': True,
                        'metadata30fps1080p': True, 'inputUnchangedDuringExtraction': True},
              'uniqueFramesExtracted': len(frame_rows), 'windowCount': len(window_rows),
              'decodeSelectPasses': 1, 'frames': frame_rows, 'windows': window_rows,
              'manualVisualReviewCompleted': False, 'continuousMotionPlaybackReviewed': False,
              'scope': 'Actual final encoded MP4 frames, sampled every 10 frames in 13 short handoffs. '
                       'Successful extraction is not a completed visual review or full-duration viewing.'}
    write_json(OUT / 'motion-manifest.json', report)
    write_json(OUT / 'run-status.json', {key: report[key] for key in
                                      ['status', 'finishedAtUTC', 'videoSHA256', 'uniqueFramesExtracted', 'windowCount']})
    lines = ['# V2 最终编码动作抽帧', '', f'输入：{VIDEO}', f'SHA-256：`{inputs["videoSHA256"]}`', '',
             '成功标记、冻结时间线、主 QA 哈希及 9776 帧 / 30 fps / 1080p 检查通过。',
             f'一次 select 解码得到 {len(frame_rows)} 个唯一帧，生成 {len(window_rows)} 张 4×3 接触表。',
             '每窗 12 帧、间隔 10 帧、跨度 3.667 秒；单格宽 480 px，原帧保留 1920×1080。', '',
             '**目视复查尚未完成。抽样不能排除样本之间的单帧闪烁，也不等同于完整动态播放审查。**', '',
             '| 窗口 | 帧范围 | 接触表 |', '| --- | --- | --- |']
    lines += [f'| {window["title"]} | {window["startFrame"]}–{window["endFrame"]} | '
              f'[打开](contacts/{window["id"]}.jpg) |' for window in window_rows]
    (OUT / 'motion-review-ready.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'videoSHA256': inputs['videoSHA256'],
                      'uniqueFrames': len(frame_rows), 'contactSheets': len(window_rows),
                      'output': str(OUT)}, ensure_ascii=False), flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except GateError as error:
        if ACTIVE_RUN:
            write_json(OUT / 'run-status.json', {**ACTIVE_RUN, 'status': 'failed',
                                                'finishedAtUTC': now(), 'error': str(error)})
        print(f'GATE_REJECTED: {error}', file=sys.stderr, flush=True)
        raise SystemExit(3)
    except Exception as error:
        if ACTIVE_RUN:
            write_json(OUT / 'run-status.json', {**ACTIVE_RUN, 'status': 'failed',
                                                'finishedAtUTC': now(), 'error': str(error)})
        print(f'MOTION_QA_FAILED: {error}', file=sys.stderr, flush=True)
        raise SystemExit(1)
