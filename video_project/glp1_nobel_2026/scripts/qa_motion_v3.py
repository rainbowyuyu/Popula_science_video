"""Plan or extract a bounded V3 motion review from the final encoded delivery.

--plan-only reads the current timeline and writes a provisional plan without
opening or decoding a video. Normal mode requires a new MP4, a render marker
with videoSHA256/timelineSHA256, and matching successful qa_final.py results.
One ffmpeg select pass extracts 70–140 unique frames. It does not certify art,
motion quality, scientific correctness, or complete audiovisual playback.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import html
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
TIMELINE = ROOT / 'src/timeline.json'
VIDEO = ROOT / 'delivery/GLP1_1080p.mp4'
MARKER = ROOT / 'tmp/final-render.json'
MAIN_QA = ROOT / 'research/qa/final/automatic-report.json'
BASELINE = ROOT / 'research/revision-v3/before-v3.json'
OUT = ROOT / 'research/qa/final-motion-v3'
MICRO_IDS = ['g008', 'g010', 'g012', 'g013', 'g016', 'g017', 'g025', 'g032']
ACTIVE_RUN: dict = {}


class GateError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise GateError(message)


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def read_json(path):
    require(path.is_file(), f'Required input missing: {path}')
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as error:
        raise GateError(f'Cannot read {path}: {error}') from error


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def canonical_sha(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode('utf-8')).hexdigest()


def file_state(path):
    status = path.stat()
    return {'bytes': status.st_size, 'mtimeNS': status.st_mtime_ns}


def run(args):
    return subprocess.run(args, capture_output=True, text=True,
                          encoding='utf-8', errors='replace')


def clip_at(timeline, frame):
    return next((clip['id'] for clip in timeline['clips']
                 if clip['start'] <= frame < clip['end']), 'references')


def build_plan(timeline, timeline_sha):
    """Every clip handoff is covered; critical zooms receive extra interior samples."""
    total, fps = timeline.get('duration'), timeline.get('fps')
    require(type(total) is int and total > 0, 'Timeline duration must be positive integer frames.')
    require(isinstance(fps, (int, float)) and fps > 0, 'Timeline fps is missing/invalid.')
    clips = timeline.get('clips', [])
    require(len(clips) == 48, 'This episode plan expects the current 48 narrated clips.')
    require([clip.get('id') for clip in clips] == [f'g{i:03d}' for i in range(1, 49)],
            'Expected unique ordered IDs g001–g048.')
    require(all(type(clip.get('start')) is int and type(clip.get('end')) is int
                and 0 <= clip['start'] < clip['end'] <= total for clip in clips),
            'Clip boundaries must be valid integer frame positions.')
    require(all(a['end'] <= b['start'] for a, b in zip(clips, clips[1:])),
            'Clip intervals overlap or are not ordered.')
    selected = defaultdict(list)
    clamp_frame = lambda frame: max(0, min(total - 1, round(frame)))

    def add(frame, reason):
        frame = clamp_frame(frame)
        if reason not in selected[frame]:
            selected[frame].append(reason)
        return frame

    offset = max(1, round(.45 * fps))
    boundaries = []
    for clip in clips:
        center = clip['start']
        frames = [add(center - offset, f'{clip["id"]}:before'),
                  add(center + offset, f'{clip["id"]}:after')]
        boundaries.append({'id': f'enter_{clip["id"]}', 'clip': clip['id'],
                           'centerFrame': center, 'frames': sorted(set(frames))})
    # Include the end of the last narrated clip and the actual encoded first/last frames.
    final_center = clips[-1]['end']
    boundaries.append({'id': 'leave_g048', 'clip': 'g048', 'centerFrame': final_center,
                       'frames': sorted(set([add(final_center - offset, 'g048:end:before'),
                                             add(final_center + offset, 'g048:end:after')]))})
    add(0, 'first_encoded_frame')
    add(total - 1, 'last_encoded_frame')
    micro = []
    for clip in clips:
        if clip['id'] not in MICRO_IDS:
            continue
        center = clip['start']
        frames = [add(center - offset, f'micro:{clip["id"]}:before'),
                  add(center, f'micro:{clip["id"]}:boundary'),
                  add(center + offset, f'micro:{clip["id"]}:after')]
        for portion in (.2, .5, .8):
            frames.append(add(center + (clip['end'] - center) * portion,
                              f'micro:{clip["id"]}:{portion:.0%}'))
        micro.append({'id': f'micro_{clip["id"]}', 'title': f'{clip["id"]} | scale / transparency',
                      'frames': sorted(set(frames))})

    # The current episode reserves nine seconds for the paper coda, matching Film.tsx.
    # Film.tsx starts PaperCoda at duration - 9 seconds, even when the last
    # narrated clip overlaps that range. Keep this derived from the current
    # duration rather than from a stale clip end or old V2 frame count.
    coda_start = max(0, total - round(9 * fps))
    coda = sorted(set(add(coda_start + seconds * fps, f'paper_coda:{seconds:g}s')
                      for seconds in [0, .7, 2.4, 5, 8]))
    coda.append(add(total - 1, 'paper_coda:last'))
    coda = sorted(set(coda))
    require(len(selected) <= 140, 'Mandatory samples exceed 140; revise bounded strategy, never silently drop handoffs.')
    # Optional exact centres of major section changes use only the remaining budget.
    exact_sections = []
    for section in timeline.get('sections', []):
        frame = clamp_frame(section['start'])
        if frame not in selected and len(selected) >= 140:
            continue
        add(frame, f'section:{section["id"]}:center')
        exact_sections.append(frame)
    require(70 <= len(selected) <= 140, 'Expected 70–140 unique review samples.')

    contacts = []
    for start in range(0, len(boundaries), 4):
        chunk = boundaries[start:start + 4]
        contacts.append({'id': f'handoffs_{start // 4 + 1:02d}',
                         'title': f'Handoffs {chunk[0]["clip"]} – {chunk[-1]["clip"]}',
                         'frames': sorted(set(f for item in chunk for f in item['frames']))})
    contacts.extend(micro)
    contacts.append({'id': 'paper_coda', 'title': 'Paper coda | enter / settle / hold', 'frames': coda})
    covered = {frame for contact in contacts for frame in contact['frames']}
    remaining = sorted(set(selected) - covered)
    for start in range(0, len(remaining), 12):
        contacts.append({'id': f'context_{start // 12 + 1:02d}', 'title': 'Context / section centres',
                         'frames': remaining[start:start + 12]})
    require(all(1 <= len(contact['frames']) <= 12 for contact in contacts),
            'Each contact must have at most twelve frames.')
    return {'version': 'V3', 'timelineSHA256': timeline_sha, 'fps': fps,
            'durationFrames': total, 'clipCount': len(clips),
            'sampling': {'uniqueFrameCount': len(selected), 'minimum': 70, 'maximum': 140,
                         'handoffOffsetSeconds': offset / fps, 'fullClipHandoffsCovered': True,
                         'criticalClipIDs': MICRO_IDS, 'codaAssumptionSeconds': 9,
                         'note': 'All clip boundaries have before/after samples; critical zooms add the exact '
                                 'boundary and 20/50/80% progression. A sample is not continuous playback.'},
            'boundaries': boundaries, 'criticalWindows': micro, 'contacts': contacts,
            'frames': [{'frame': frame, 'timeSeconds': frame / fps, 'clip': clip_at(timeline, frame),
                        'reasons': selected[frame]} for frame in sorted(selected)]}


def validate_inputs(timeline, plan, expected_sha=None):
    """No output extraction until every provenance and completed-render gate passes."""
    marker, qa, baseline = read_json(MARKER), read_json(MAIN_QA), read_json(BASELINE)
    total, fps = timeline['duration'], timeline['fps']
    require(marker.get('success') is True and bool(marker.get('finished')),
            'Final render marker is unsuccessful or has no completion timestamp.')
    require(marker.get('frames') == [0, total - 1], 'Marker is old or does not cover the complete current timeline.')
    require(Path(marker.get('outputLocation', '')).resolve() == VIDEO.resolve(),
            'Final render marker points at a different video.')
    require(marker.get('timelineSHA256') == plan['timelineSHA256'],
            'Marker timelineSHA256 missing/mismatched. Add the current timeline hash to the final render marker.')
    require(qa.get('automaticChecksPass') is True, 'Run qa_final.py successfully on the new complete MP4 first.')
    require(qa.get('timelineSHA256') == plan['timelineSHA256'], 'Main QA belongs to a different timeline.')
    require(Path(qa.get('video', '')).resolve() == VIDEO.resolve(), 'Main QA belongs to another video path.')
    require(qa.get('checks', {}).get('fullDecodeSuccess') is True
            and qa.get('checks', {}).get('decodedFramesMatchTimeline') is True,
            'Main QA did not confirm a complete successful decode matching the timeline.')
    require(qa.get('measured', {}).get('decodedFrames') == total,
            'Main QA decoded frame count does not match this timeline.')
    require(VIDEO.is_file() and VIDEO.stat().st_size > 0, 'Final MP4 is absent or empty.')
    input_state = file_state(VIDEO)
    video_sha = sha(VIDEO)
    require(file_state(VIDEO) == input_state, 'MP4 changed during hashing.')
    require(video_sha == marker.get('videoSHA256') == qa.get('videoSHA256'),
            'Current MP4, final marker and main QA video hashes must all match.')
    require(re.fullmatch(r'[0-9a-f]{64}', str(baseline.get('videoSHA256', ''))) is not None,
            'before-v3.json must contain the recorded pre-revision video SHA-256.')
    require(video_sha != baseline['videoSHA256'], 'The old pre-V3 MP4 cannot be accepted as the V3 delivery.')
    if expected_sha:
        require(video_sha == expected_sha.lower(), 'Video does not match --expected-sha256.')
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
    require(ffmpeg and ffprobe, 'ffmpeg and ffprobe must be on PATH.')
    probe_args = [ffprobe, '-v', 'error', '-select_streams', 'v:0', '-show_streams',
                  '-show_format', '-of', 'json', str(VIDEO)]
    probe = run(probe_args)
    require(probe.returncode == 0, f'ffprobe metadata failed: {probe.stderr[-1000:]}')
    metadata = json.loads(probe.stdout)
    streams = metadata.get('streams', [])
    require(len(streams) == 1, 'Expected a single selected video stream.')
    encoded = streams[0]
    require(str(encoded.get('nb_frames')) == str(total), 'Encoded metadata frame count differs from timeline.')
    require(Fraction(encoded.get('avg_frame_rate', '0/1')) == Fraction(str(fps)),
            'Encoded frame rate differs from timeline.')
    require((encoded.get('width'), encoded.get('height')) == (1920, 1080), 'Expected final 1080p delivery.')
    duration = float(encoded.get('duration', metadata['format'].get('duration', 0)))
    require(abs(duration - total / fps) <= 1 / fps, 'Encoded duration differs from timeline.')
    require(sha(TIMELINE) == plan['timelineSHA256'] and file_state(VIDEO) == input_state,
            'Timeline or MP4 changed during readiness checks.')
    return {'marker': marker, 'mainQA': qa, 'videoSHA256': video_sha, 'inputState': input_state,
            'timelineSHA256': plan['timelineSHA256'], 'markerSHA256': sha(MARKER),
            'mainQASHA256': sha(MAIN_QA), 'ffmpeg': ffmpeg, 'metadata': metadata,
            'probeCommand': probe_args}


def font(size):
    for name in ['C:/Windows/Fonts/NotoSansSC-VF.ttf', 'C:/Windows/Fonts/msyh.ttc',
                 'C:/Windows/Fonts/arial.ttf']:
        if Path(name).is_file():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def contact_sheet(contact, timeline, video_sha):
    width, image_height, columns = 640, 360, 2
    gap, label_height, header = 18, 45, 94
    rows = math.ceil(len(contact['frames']) / columns)
    canvas = Image.new('RGB', (gap + columns * (width + gap),
                              header + gap + rows * (image_height + label_height + gap)), '#f2eee7')
    draw = ImageDraw.Draw(canvas)
    draw.text((gap, 12), f'V3 encoded MP4 | {contact["title"]}', font=font(28), fill='#29484a')
    draw.text((gap, 53), f'{timeline["fps"]} fps | artifact {video_sha[:16]} | visual review pending',
              font=font(23), fill='#647978')
    for index, frame in enumerate(contact['frames']):
        x = gap + index % columns * (width + gap)
        y = header + gap + index // columns * (image_height + label_height + gap)
        with Image.open(OUT / 'frames' / f'frame-{frame:06d}.jpg') as source:
            canvas.paste(source.convert('RGB').resize((width, image_height), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 4, y + image_height + 7),
                  f'F{frame:05d} | {frame / timeline["fps"]:.3f}s | {clip_at(timeline, frame)}',
                  font=font(25), fill='#29484a')
    dest = OUT / 'contacts' / f'{contact["id"]}.jpg'
    canvas.save(dest, quality=94, subsampling=0)
    return dest


def mobile_index(plan, video_sha):
    sections = []
    frames_by_number = {row['frame']: row for row in plan['frames']}
    for contact in plan['contacts']:
        items = []
        for frame in contact['frames']:
            image = f'frames/frame-{frame:06d}.jpg'
            label = f'F{frame} · {frame / plan["fps"]:.3f}s · {frames_by_number[frame]["clip"]}'
            items.append(f'<figure><a href="{image}"><img loading="lazy" src="{image}" alt="{label}"></a>'
                         f'<figcaption>{label}</figcaption></figure>')
        sections.append(f'<section><h2>{html.escape(contact["title"])}</h2>{"".join(items)}</section>')
    document = ('<!doctype html><html lang="zh"><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width,initial-scale=1">'
                '<title>V3 encoded motion samples</title><style>'
                'body{margin:auto;padding:20px;max-width:860px;background:#f2eee7;color:#29484a;'
                'font:18px/1.5 system-ui,sans-serif}h1{font-size:28px}h2{font-size:23px}'
                'figure{margin:0 0 28px}img{display:block;width:100%;height:auto}figcaption{padding-top:8px}'
                'section{margin:40px 0}code{overflow-wrap:anywhere}</style>'
                f'<h1>V3 最终编码动作样本</h1><p>SHA-256：<code>{video_sha}</code></p>'
                '<p>尚待目视复查。单列图片支持手机浏览；点击可打开原始 1080p 抽帧。'
                '抽样不等于连续动态播放，也不能排除样本之间的闪烁。</p>' + ''.join(sections) + '</html>')
    (OUT / 'index.html').write_text(document, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan-only', action='store_true', help='Write a provisional current-timeline plan; never read/decode MP4.')
    parser.add_argument('--expected-sha256', help='Optional extra pin to the exact completed MP4.')
    args = parser.parse_args()
    if args.expected_sha256 and re.fullmatch(r'[0-9a-fA-F]{64}', args.expected_sha256) is None:
        parser.error('--expected-sha256 needs exactly 64 hexadecimal characters')
    timeline_sha = sha(TIMELINE)
    timeline = read_json(TIMELINE)
    plan = build_plan(timeline, timeline_sha)
    require(sha(TIMELINE) == timeline_sha, 'Timeline changed while constructing the plan.')
    if args.plan_only:
        OUT.mkdir(parents=True, exist_ok=True)
        write_json(OUT / 'provisional-plan.json', {'status': 'plan-only-no-video-opened',
                   'generatedAtUTC': now(), 'rebuildAutomaticallyOnExtraction': True, **plan})
        (OUT / 'provisional-plan.md').write_text(
            '# V3 动效抽帧计划（未解码、未验收）\n\n'
            f'当前时间线 {plan["durationFrames"]} 帧 / {plan["fps"]} fps；'
            f'计划 {len(plan["frames"])} 个唯一帧、{len(plan["contacts"])} 组联系表。\n\n'
            '最终运行会重新读取时间线，不沿用本次帧号。所有片段交界有前后样本，关键缩放场景另有'
            '正中和片内 20% / 50% / 80% 样本。每组不超过 12 张、两列 640 px；另有手机单列 HTML。\n\n'
            '门禁要求新完整 MP4、带当前视频和时间线 SHA-256 的成功 final-render.json，'
            '以及匹配的 qa_final.py 完整解码结果。前一版 MP4 将被拒绝。\n\n'
            '**本文件仅说明计划，没有读取成片，也不代表美术或动态验收通过。**\n', encoding='utf-8')
        print(json.dumps({'status': 'plan-only-no-video-opened', 'frames': len(plan['frames']),
                          'contacts': len(plan['contacts']), 'timelineFrames': plan['durationFrames'],
                          'output': str(OUT / 'provisional-plan.json')}, ensure_ascii=False))
        return 0

    inputs = validate_inputs(timeline, plan, args.expected_sha256)
    existing = OUT / 'motion-manifest.json'
    if existing.is_file():
        old = read_json(existing)
        require(old.get('videoSHA256') == inputs['videoSHA256'],
                'Output already holds another artifact; preserve/relocate that review before extracting again.')
    OUT.mkdir(parents=True, exist_ok=True)
    for directory in [OUT / 'frames', OUT / 'contacts']:
        directory.mkdir(exist_ok=True)
    started = now()
    temporary = Path(tempfile.mkdtemp(prefix='extract-', dir=OUT))
    ACTIVE_RUN.update(startedAtUTC=started, videoSHA256=inputs['videoSHA256'])
    write_json(OUT / 'run-status.json', {**ACTIVE_RUN, 'status': 'extracting',
                                        'temporaryDirectory': str(temporary)})
    write_json(OUT / 'input-plan.json', plan)
    write_json(OUT / 'input-render-marker.json', inputs['marker'])
    write_json(OUT / 'input-ffprobe.json', inputs['metadata'])
    selected = [item['frame'] for item in plan['frames']]
    expression = '+'.join(f'eq(n\\,{frame})' for frame in selected)
    command = [inputs['ffmpeg'], '-hide_banner', '-nostdin', '-xerror', '-i', str(VIDEO),
               '-map', '0:v:0', '-an', '-vf', f'select={expression}', '-fps_mode', 'vfr',
               '-q:v', '2', '-start_number', '0', '-y', str(temporary / 'selected-%06d.jpg')]
    print(f'Extracting {len(selected)} final encoded frames in one bounded select pass.', flush=True)
    extraction = run(command)
    (OUT / 'extract.stdout.txt').write_text(extraction.stdout, encoding='utf-8')
    (OUT / 'extract.stderr.txt').write_text(extraction.stderr, encoding='utf-8')
    write_json(OUT / 'commands.json', [{'name': 'ffprobe-metadata', 'command': inputs['probeCommand']},
                                     {'name': 'extract-selected', 'command': command, 'exitCode': extraction.returncode}])
    require(extraction.returncode == 0, f'ffmpeg extraction failed: {extraction.stderr[-1000:]}')
    require(len(list(temporary.glob('selected-*.jpg'))) == len(selected), 'Decoded sample count differs from plan.')
    require(file_state(VIDEO) == inputs['inputState'] and sha(VIDEO) == inputs['videoSHA256'],
            'MP4 changed during extraction.')
    require(sha(TIMELINE) == timeline_sha and sha(MARKER) == inputs['markerSHA256']
            and sha(MAIN_QA) == inputs['mainQASHA256'], 'Source timeline or provenance changed during extraction.')
    frame_rows = []
    for index, row in enumerate(plan['frames']):
        source = temporary / f'selected-{index:06d}.jpg'
        require(source.is_file(), f'Missing extraction frame {index}.')
        with Image.open(source) as image:
            require(image.size == (1920, 1080), 'Unexpected extracted frame resolution.')
        destination = OUT / 'frames' / f'frame-{row["frame"]:06d}.jpg'
        source.replace(destination)
        frame_rows.append({**row, 'path': str(destination.relative_to(ROOT)), 'sha256': sha(destination)})
    temporary.rmdir()  # Only this known, now-empty temporary folder is removed.
    contact_rows = []
    for contact in plan['contacts']:
        destination = contact_sheet(contact, timeline, inputs['videoSHA256'])
        contact_rows.append({**contact, 'path': str(destination.relative_to(ROOT)),
                             'sha256': sha(destination), 'visualReviewStatus': 'pending'})
    mobile_index(plan, inputs['videoSHA256'])
    report = {'status': 'ready-for-visual-review', 'startedAtUTC': started, 'finishedAtUTC': now(),
              'video': str(VIDEO), 'videoSHA256': inputs['videoSHA256'], 'videoBytes': inputs['inputState']['bytes'],
              'timelineSHA256': timeline_sha, 'planSHA256': canonical_sha(plan),
              'renderMarkerSHA256': inputs['markerSHA256'], 'mainQASHA256': inputs['mainQASHA256'],
              'fps': plan['fps'], 'durationFrames': plan['durationFrames'],
              'gates': {'completeRenderMarker': True, 'markerVideoAndTimelineHashesMatch': True,
                        'mainQAHashesMatch': True, 'mainQAFullDecodePassed': True,
                        'oldRevisionVideoRejected': True, 'metadataMatchesTimeline': True,
                        'inputsUnchangedDuringExtraction': True},
              'automaticExtractionChecksPass': True, 'decodeSelectPasses': 1,
              'uniqueFramesExtracted': len(frame_rows), 'contactCount': len(contact_rows),
              'frames': frame_rows, 'contacts': contact_rows,
              'manualVisualReviewCompleted': False, 'continuousMotionPlaybackReviewed': False,
              'scope': 'Bounded final encoded MP4 samples only. Successful extraction does not certify '
                       'visual quality, scientific accuracy, continuous movement, or full-duration viewing.'}
    write_json(OUT / 'motion-manifest.json', report)
    write_json(OUT / 'run-status.json', {key: report[key] for key in
                                      ['status', 'finishedAtUTC', 'videoSHA256', 'uniqueFramesExtracted', 'contactCount']})
    (OUT / 'motion-review-ready.md').write_text(
        '# V3 最终编码动效样本\n\n'
        f'视频 SHA-256：`{inputs["videoSHA256"]}`\n\n'
        f'读取真实最终 MP4，一次 select 解码取得 {len(frame_rows)} 个唯一帧，'
        f'生成 {len(contact_rows)} 张联系表。[手机单列浏览](index.html)。\n\n'
        '**目视审查仍待完成；这里没有自动给出美术通过结论，也没有连续完整播放的声明。**\n\n'
        + '\n'.join(f'- [{row["title"]}](contacts/{row["id"]}.jpg)' for row in contact_rows) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'frames': len(frame_rows),
                      'contacts': len(contact_rows), 'output': str(OUT)}, ensure_ascii=False), flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (GateError, OSError, ValueError) as error:
        if ACTIVE_RUN:
            write_json(OUT / 'run-status.json', {**ACTIVE_RUN, 'status': 'failed',
                                                'finishedAtUTC': now(), 'error': str(error)})
        print(f'GATE_REJECTED: {error}', file=sys.stderr, flush=True)
        raise SystemExit(3)
