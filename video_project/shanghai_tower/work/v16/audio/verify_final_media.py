"""Independent final-MP4 QA for the original-speed V16 edits.

This deliberately does not import or alter legacy qa_final_audio.py. Expected
length and shot boundaries come only from src/v16/audio-timeline*.json.
Automatic decoding/format checks do not imply subjective review of every frame.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for block in iter(lambda: fh.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def run(command: list[str], stem: Path) -> subprocess.CompletedProcess:
    write_json(stem.with_suffix('.command.json'), command)
    proc = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    stem.with_suffix('.stdout.txt').write_text(proc.stdout, encoding='utf-8')
    stem.with_suffix('.stderr.txt').write_text(proc.stderr, encoding='utf-8')
    return proc


def extraction_plan(timeline: dict) -> list[dict]:
    duration = int(timeline['durationFrames'])
    fps = int(timeline['fps'])
    reasons: dict[int, list[str]] = defaultdict(list)

    def add(frame: int, reason: str) -> None:
        frame = max(0, min(duration - 1, int(frame)))
        if reason not in reasons[frame]:
            reasons[frame].append(reason)

    add(0, 'opening:first-frame')
    add(112, 'opening:photo-model-reference')
    segments = timeline['sceneSegments']
    for index, seg in enumerate(segments):
        name = seg['id']
        start, voice_end, end = [int(seg[k]) for k in ('start', 'voiceEnd', 'end')]
        add(start, f'{name}:scene-start')
        add((start + voice_end - 1) // 2, f'{name}:speech-middle')
        add(voice_end, f'{name}:voice-end')
        add(voice_end - 1, f'{name}:silence-before')
        if end > voice_end:
            add((voice_end + end - 1) // 2, f'{name}:silence-middle')
            add(end - 1, f'{name}:silence-last-frame')
            add(end, f'{name}:silence-after')
        if index + 1 < len(segments):
            nxt = segments[index + 1]
            source_from = min(seg['sourceEnd'] + 1, seg['sourceStart'] + voice_end - start)
            delta = max(0, nxt['sourceStart'] - source_from)
            gap = max(1, nxt['start'] - voice_end)
            if delta > max(80, 6 * gap):
                mid = voice_end + gap // 2
                add(mid - 1, f'{name}:sky-whip-before-state-switch')
                add(mid, f'{name}:sky-whip-state-switch')
                add(mid + 1, f'{name}:sky-whip-after-state-switch')
    outro = timeline['outro']
    add(outro['start'], 'references:start')
    add((outro['start'] + outro['end'] - 1) // 2, 'references:middle')
    add(outro['end'] - 1, 'references:last-frame')
    return [{'frame': f, 'seconds': f / fps, 'reasons': reasons[f]} for f in sorted(reasons)]


def make_sheets(entries: list[dict], frames: Path, out: Path, vertical: bool) -> list[dict]:
    thumb_w, thumb_h, cols, rows = (360, 640, 3, 2) if vertical else (640, 360, 3, 3)
    label_h = 52
    font_path = Path('C:/Windows/Fonts/arial.ttf')
    font = ImageFont.truetype(str(font_path), 18) if font_path.exists() else ImageFont.load_default()
    per_sheet = cols * rows
    sheets = []
    for offset in range(0, len(entries), per_sheet):
        group = entries[offset:offset + per_sheet]
        sheet_rows = math.ceil(len(group) / cols)
        sheet = Image.new('RGB', (cols * thumb_w, sheet_rows * (thumb_h + label_h)), '#e9eef0')
        draw = ImageDraw.Draw(sheet)
        for i, entry in enumerate(group):
            path = frames / f"frame-{entry['frame']:05d}.jpg"
            with Image.open(path) as im:
                picture = im.convert('RGB')
                picture.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                x = (i % cols) * thumb_w
                y = (i // cols) * (thumb_h + label_h)
                sheet.paste(picture, (x + (thumb_w - picture.width) // 2, y))
            draw.text((x + 9, y + thumb_h + 4), f"F{entry['frame']} | {entry['seconds']:.3f}s", font=font, fill='#183440')
            label = ' / '.join(entry['reasons'])
            max_chars = 38 if vertical else 70
            draw.text((x + 9, y + thumb_h + 26), label[:max_chars], font=font, fill='#183440')
        target = out / f'contact-{offset // per_sheet + 1:02d}.jpg'
        sheet.save(target, quality=93, subsampling=0)
        sheets.append({'path': str(target), 'sha256': digest(target), 'frames': [x['frame'] for x in group]})
    return sheets


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', type=Path)
    parser.add_argument('--vertical', action='store_true')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--prepare-only', action='store_true', help='Write actual V16 extraction plan without requiring the MP4.')
    args = parser.parse_args()
    kind = 'vertical' if args.vertical else 'main'
    timeline_path = ROOT / 'src/v16' / ('audio-timeline-vertical.json' if args.vertical else 'audio-timeline.json')
    marker_path = ROOT / 'tmp/v16' / f'v16-{kind}-render.json'
    video = (args.video or ROOT / 'delivery' / ('ShanghaiTower_1080x1920_v16.mp4' if args.vertical else 'ShanghaiTower_1080p_v16.mp4')).resolve()
    out = (args.out or ROOT / 'work/v16/audio/final-media-qa' / kind).resolve()
    out.mkdir(parents=True, exist_ok=True)
    timeline = json.loads(timeline_path.read_text(encoding='utf-8-sig'))
    duration_frames = int(timeline['durationFrames'])
    fps = int(timeline['fps'])
    duration_seconds = duration_frames / fps
    width, height = (1080, 1920) if args.vertical else (1920, 1080)
    plan = extraction_plan(timeline)
    write_json(out / 'extraction-plan.json', plan)
    report = {
        'generatedUTC': datetime.now(timezone.utc).isoformat(),
        'kind': kind,
        'video': str(video),
        'timeline': {'path': str(timeline_path), 'sha256': digest(timeline_path)},
        'expected': {'width': width, 'height': height, 'fps': fps, 'frames': duration_frames, 'seconds': duration_seconds},
        'renderMarker': {'path': str(marker_path)},
        'sampling': {'count': len(plan), 'minFrame': plan[0]['frame'], 'maxFrame': plan[-1]['frame'], 'plan': str(out / 'extraction-plan.json')},
        'checks': {},
        'manualFramesReviewed': [],
        'subjectiveListeningChecked': False,
        'fullMotionManuallyViewed': False,
        'scope': 'Metadata, full audio/video decode, blackdetect and selected actual encoded frames. No claim of human listening, complete motion viewing, physics validation or automatic aesthetic validation.',
    }
    report_path = out / 'media-report.json'

    def finish(status: str, code: int) -> int:
        report['status'] = status
        report['automaticChecksPassed'] = bool(report['checks']) and all(x['passed'] for x in report['checks'].values())
        write_json(report_path, report)
        print(json.dumps({'status': status, 'automaticChecksPassed': report['automaticChecksPassed'], 'report': str(report_path)}, ensure_ascii=False), flush=True)
        return code

    def check(name: str, passed: bool, actual: object = None, expected: object = None) -> None:
        report['checks'][name] = {'passed': bool(passed), 'actual': actual, 'expected': expected}

    if args.prepare_only:
        return finish('prepared_media_not_checked', 0)
    if not video.is_file() or not marker_path.is_file():
        report['missing'] = [str(p) for p in [video, marker_path] if not p.is_file()]
        return finish('pending_missing_video_or_render_marker', 2)

    marker = json.loads(marker_path.read_text(encoding='utf-8-sig'))
    report['renderMarker'].update({'sha256': digest(marker_path), 'content': marker})
    report['videoSHA256'] = digest(video)
    expected_comp = 'ShanghaiTowerV16Vertical' if args.vertical else 'ShanghaiTowerV16'
    same_output = os.path.normcase(str(Path(marker.get('outputLocation', '')).resolve())) == os.path.normcase(str(video))
    check('renderMarkerComplete', marker.get('success') is True and bool(marker.get('finished')) and marker.get('composition') == expected_comp and marker.get('frames') == [0, duration_frames - 1] and same_output,
          {'success': marker.get('success'), 'finished': marker.get('finished'), 'composition': marker.get('composition'), 'frames': marker.get('frames'), 'outputMatches': same_output},
          {'success': True, 'composition': expected_comp, 'frames': [0, duration_frames - 1], 'outputMatches': True})
    if not report['checks']['renderMarkerComplete']['passed']:
        return finish('pending_incomplete_or_mismatched_render_marker', 2)
    try:
        proc = run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)], out / 'ffprobe')
        check('ffprobeSucceeded', proc.returncode == 0, proc.returncode, 0)
        if proc.returncode:
            return finish('failed_probe', 1)
        meta = json.loads(proc.stdout)
        write_json(out / 'ffprobe.json', meta)
        vs = [x for x in meta['streams'] if x['codec_type'] == 'video']
        aus = [x for x in meta['streams'] if x['codec_type'] == 'audio']
        check('oneVideoAndOneAudio', len(vs) == len(aus) == 1, [len(vs), len(aus)], [1, 1])
        if len(vs) != 1 or len(aus) != 1:
            return finish('failed_stream_count', 1)
        v, a = vs[0], aus[0]
        check('videoCodec', v.get('codec_name') == 'h264', v.get('codec_name'), 'h264')
        check('dimensions', [v.get('width'), v.get('height')] == [width, height], [v.get('width'), v.get('height')], [width, height])
        observed_fps = float(Fraction(v['avg_frame_rate']))
        check('frameRate', abs(observed_fps - fps) < 1e-9, observed_fps, fps)
        check('pixelFormat', v.get('pix_fmt') == 'yuv420p', v.get('pix_fmt'), 'yuv420p')
        check('bt709Metadata', all(v.get(k) == 'bt709' for k in ('color_space', 'color_transfer', 'color_primaries')),
              {k: v.get(k) for k in ('color_space', 'color_transfer', 'color_primaries')}, 'bt709')
        container_frames = int(v.get('nb_frames', -1))
        check('containerFrameCount', container_frames == duration_frames, container_frames, duration_frames)
        video_duration = float(v.get('duration', meta['format']['duration']))
        audio_duration = float(a.get('duration', meta['format']['duration']))
        check('videoDuration', abs(video_duration - duration_seconds) < 1 / fps, video_duration, duration_seconds)
        check('audioDuration', abs(audio_duration - duration_seconds) < 0.10, audio_duration, duration_seconds)
        check('avDurationDifference', abs(video_duration - audio_duration) <= 0.10, abs(video_duration - audio_duration), '<=0.10 seconds')
        check('audioFormat', a.get('codec_name') == 'aac' and a.get('sample_rate') == '48000' and a.get('channels') == 2,
              {k: a.get(k) for k in ('codec_name', 'sample_rate', 'channels', 'channel_layout')}, {'codec_name': 'aac', 'sample_rate': '48000', 'channels': 2})
        print('Decoding all video and audio packets and checking black frames...', flush=True)
        decode = run(['ffmpeg', '-hide_banner', '-nostats', '-v', 'info', '-xerror', '-err_detect', 'explode', '-i', str(video),
                      '-map', '0:v:0', '-map', '0:a:0', '-vf', 'blackdetect=d=0.12:pix_th=0.10:pic_th=0.98',
                      '-progress', 'pipe:1', '-f', 'null', '-'], out / 'full-decode-blackdetect')
        check('fullAudioVideoDecode', decode.returncode == 0, decode.returncode, 0)
        decoded_counts = re.findall(r'^frame=(\d+)\s*$', decode.stdout, re.MULTILINE)
        decoded_frames = int(decoded_counts[-1]) if decoded_counts else -1
        check('fullyDecodedFrameCount', decoded_frames == duration_frames, decoded_frames, duration_frames)
        events = [{'start': float(s), 'end': float(e), 'duration': float(d)} for s, e, d in re.findall(r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)', decode.stderr)]
        report['blackdetect'] = {'minimumDurationSeconds': 0.12, 'pixelThreshold': 0.10, 'pictureRatioThreshold': 0.98, 'events': events}
        check('noBlackIntervalsAtConfiguredThreshold', not events, events, [])
        if decode.returncode:
            return finish('failed_full_decode', 1)

        frames_dir = out / 'frames'
        frames_dir.mkdir(exist_ok=True)
        selected = '+'.join(f"eq(n\\,{x['frame']})" for x in plan)
        print(f'Extracting {len(plan)} exact frame indices from the encoded MP4...', flush=True)
        entries = []
        # A fresh staging directory prevents stale frames from making a failed
        # or interrupted rerun appear to have extracted all planned indices.
        with tempfile.TemporaryDirectory(prefix='extract-', dir=out) as stage:
            extract = run(['ffmpeg', '-hide_banner', '-nostats', '-v', 'error', '-y', '-i', str(video), '-map', '0:v:0', '-an',
                           '-vf', 'select=' + selected, '-fps_mode', 'vfr', '-q:v', '2', '-start_number', '0', str(Path(stage) / 'selected-%05d.jpg')], out / 'extract')
            check('frameExtractionSucceeded', extract.returncode == 0, extract.returncode, 0)
            if extract.returncode:
                return finish('failed_frame_extraction', 1)
            for i, entry in enumerate(plan):
                temporary = Path(stage) / f'selected-{i:05d}.jpg'
                if not temporary.is_file():
                    continue
                target = frames_dir / f"frame-{entry['frame']:05d}.jpg"
                temporary.replace(target)
                entries.append({**entry, 'path': str(target), 'sha256': digest(target)})
        check('selectedFrameCount', len(entries) == len(plan), len(entries), len(plan))
        write_json(out / 'extracted-frames.json', entries)
        if entries:
            report['contactSheets'] = make_sheets(entries, frames_dir, out, args.vertical)
        report['extractedFrameIndex'] = str(out / 'extracted-frames.json')
    except (OSError, ValueError, KeyError) as exc:
        report['exception'] = f'{type(exc).__name__}: {exc}'
        check('executionCompleted', False, report['exception'], 'complete')
        return finish('failed_exception', 1)
    passed = all(x['passed'] for x in report['checks'].values())
    return finish('automatic_pass_manual_review_pending' if passed else 'failed_automatic_checks', 0 if passed else 1)


if __name__ == '__main__':
    sys.exit(main())
