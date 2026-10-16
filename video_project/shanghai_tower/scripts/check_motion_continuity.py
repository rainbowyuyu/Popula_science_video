"""Rank adjacent-frame visual changes for manual review; never certify quality.

Only two 320x180 grayscale frames and a bounded heap of scalar scores are kept
in memory. FFmpeg uses software decoding with one thread. The source is read
only; this script does not render the scene or modify any video.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
from fractions import Fraction
import heapq
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

import numpy as np


WIDTH, HEIGHT = 320, 180
ROOT = Path(__file__).resolve().parents[1]


def executable(name: str) -> str:
    found = shutil.which(name)
    fallback = Path('C:/ffmpeg/bin') / (name + '.exe')
    if found:
        return found
    if fallback.is_file():
        return str(fallback)
    raise RuntimeError(f'{name} is unavailable on PATH or C:/ffmpeg/bin')


def read_frame(stream, size: int) -> bytes | None:
    """Pipe reads may be partial even when a complete frame is forthcoming."""
    chunks = bytearray()
    while len(chunks) < size:
        chunk = stream.read(size - len(chunks))
        if not chunk:
            if chunks:
                raise RuntimeError(f'Truncated raw frame: {len(chunks)}/{size} bytes')
            return None
        chunks.extend(chunk)
    return bytes(chunks)


def parse_roi(value: str) -> tuple[int, int, int, int]:
    try:
        roi = tuple(int(x.strip()) for x in value.split(','))
        if len(roi) != 4:
            raise ValueError
        x0, y0, x1, y1 = roi
        if not (0 <= x0 < x1 <= WIDTH and 0 <= y0 < y1 <= HEIGHT):
            raise ValueError
        return roi
    except ValueError as exc:
        raise argparse.ArgumentTypeError('ROI must be x0,y0,x1,y1 within 320x180') from exc


def arguments():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--video', type=Path, required=True, help='Existing encoded video, read only')
    p.add_argument('--out-dir', type=Path, help='Report directory; default research/qa/motion-continuity/<video-stem>')
    p.add_argument('--max-seconds', type=float, help='Analyze only this many seconds from the beginning; use 3 for a smoke check')
    p.add_argument('--top', type=int, default=20, help='Maximum ranked review locations (default: 20)')
    p.add_argument('--min-gap', type=int, default=30, help='Minimum distance between selected current-frame indices (default: 30)')
    p.add_argument('--roi', type=parse_roi, default=(112, 30, 320, 153),
                   help='Subject rectangle in downscaled pixels, x0,y0,x1,y1; outside is masked (default: 112,30,320,153)')
    args = p.parse_args()
    if args.top < 1 or args.min_gap < 1:
        p.error('--top and --min-gap must be positive')
    if args.max_seconds is not None and args.max_seconds <= 0:
        p.error('--max-seconds must be positive')
    return args


def run(args) -> dict:
    video = args.video.expanduser().resolve()
    if not video.is_file():
        raise FileNotFoundError(video)
    before = video.stat()
    out = (args.out_dir or ROOT / 'research/qa/motion-continuity' / video.stem).resolve()
    out.mkdir(parents=True, exist_ok=True)
    probe_cmd = [executable('ffprobe'), '-v', 'error', '-select_streams', 'v:0',
                 '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,duration:format=duration',
                 '-of', 'json', str(video)]
    probe = json.loads(subprocess.check_output(probe_cmd, timeout=60))
    if not probe.get('streams'):
        raise RuntimeError('Input has no video stream')
    stream = probe['streams'][0]
    rate = stream.get('avg_frame_rate', '0/0')
    if rate in ('0/0', '0/1'):
        rate = stream.get('r_frame_rate', '0/0')
    try:
        fps = float(Fraction(rate))
    except (ValueError, ZeroDivisionError) as exc:
        raise RuntimeError('Video does not provide a usable frame rate') from exc
    if fps <= 0:
        raise RuntimeError('Video frame rate must be positive')

    command = [executable('ffmpeg'), '-nostdin', '-hide_banner', '-loglevel', 'error',
               '-hwaccel', 'none', '-threads', '1', '-i', str(video)]
    if args.max_seconds is not None:
        command += ['-t', str(args.max_seconds)]
    command += ['-map', '0:v:0', '-an', '-sn', '-dn', '-vf',
                f'scale={WIDTH}:{HEIGHT}:flags=area,format=gray',
                '-filter_threads', '1', '-threads', '1', '-fps_mode', 'passthrough',
                '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1']
    # Each chosen location can exclude at most 2*gap-1 scalar candidates.
    # Keeping this many globally largest values therefore suffices for greedy
    # top-N spacing without storing all frames or the whole scalar time series.
    heap_limit = args.top * (2 * args.min_gap - 1)
    heap: list[tuple[float, int]] = []
    frame_count = 0
    previous = None
    x0, y0, x1, y1 = args.roi
    csv_path = out / 'frame-differences.csv'
    started = time.monotonic()
    with tempfile.TemporaryFile(mode='w+b') as errors, csv_path.open('w', encoding='utf-8', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['frame', 'previous_frame', 'seconds_approx', 'mean_abs_difference_0_255',
                         'p95_abs_difference_0_255', 'fraction_pixels_difference_gt24'])
        proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors)
        try:
            while True:
                raw = read_frame(proc.stdout, WIDTH * HEIGHT)
                if raw is None:
                    break
                current = np.frombuffer(raw, dtype=np.uint8).reshape(HEIGHT, WIDTH)[y0:y1, x0:x1].astype(np.int16)
                if previous is not None:
                    diff = np.abs(current - previous)
                    score = float(np.mean(diff))
                    writer.writerow([frame_count, frame_count - 1, f'{frame_count / fps:.6f}',
                                     f'{score:.6f}', f'{np.percentile(diff, 95):.6f}',
                                     f'{np.mean(diff > 24):.6f}'])
                    item = (score, frame_count)
                    if len(heap) < heap_limit:
                        heapq.heappush(heap, item)
                    elif item > heap[0]:
                        heapq.heapreplace(heap, item)
                previous = current
                frame_count += 1
                if frame_count % 900 == 0:
                    print(f'Analyzed {frame_count} frames', file=sys.stderr, flush=True)
            return_code = proc.wait(timeout=60)
            errors.seek(0)
            diagnostics = errors.read().decode('utf-8', errors='replace')
            if return_code:
                raise RuntimeError(f'FFmpeg exited {return_code}: {diagnostics[-3000:]}')
        finally:
            proc.stdout.close()
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
    if frame_count < 2:
        raise RuntimeError('At least two decoded frames are required')
    after = video.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError('Input video changed during analysis; do not use the incomplete CSV')

    selected: list[dict] = []
    for score, frame in sorted(heap, reverse=True):
        if all(abs(frame - item['frame']) >= args.min_gap for item in selected):
            selected.append({'rank': len(selected) + 1, 'frame': frame, 'previousFrame': frame - 1,
                             'secondsApprox': round(frame / fps, 6), 'meanAbsoluteDifference': score,
                             'reviewWindowFrames': [max(0, frame - 15), min(frame_count - 1, frame + 15)]})
        if len(selected) == args.top:
            break
    summary = {
        'schema': 'rainbow.motion-difference-ranking/1',
        'purpose': 'Manual-review prioritization only. Large differences can be valid motion; small differences do not prove continuity or aesthetics.',
        'qualityVerdict': None,
        'analyzedUTC': datetime.now(timezone.utc).isoformat(),
        'input': str(video), 'inputBytes': before.st_size, 'inputMtimeNs': before.st_mtime_ns,
        'sourceStream': stream, 'sourceDurationSeconds': probe.get('format', {}).get('duration'),
        'decodedFrames': frame_count, 'comparisonCount': frame_count - 1,
        'requestedMaxSeconds': args.max_seconds,
        'frameIndexConvention': 'Zero based; each row compares previousFrame with frame. No frame-rate conversion.',
        'timestampConvention': 'Frame index / reported average FPS; exact for this series CFR renders, approximate for VFR inputs.',
        'downscaledDimensions': [WIDTH, HEIGHT], 'roiPixelsExclusiveEnd': list(args.roi),
        'maskedRegions': 'Outside ROI: left title column, top logo/header band, bottom subtitle band. Geometric mask, not object tracking.',
        'rankingMetric': 'Mean absolute difference of adjacent grayscale pixels in ROI, range 0..255.',
        'secondaryMetrics': 'P95 and fraction over24 are diagnostic magnitudes, not pass/fail thresholds.',
        'minGapFrames': args.min_gap, 'requestedLocations': args.top,
        'rankedLocations': selected,
        'chronologicalReviewFrames': sorted(x['frame'] for x in selected),
        'timeSeries': str(csv_path), 'ffmpegCommand': command,
        'elapsedSeconds': round(time.monotonic() - started, 3),
        'memoryPolicy': f'Two grayscale ROI buffers plus at most {heap_limit} scalar heap entries; time series streamed to CSV.',
    }
    (out / 'motion-continuity.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# Adjacent-frame change ranking', '',
             'This is an anomaly ranking for manual review, not a continuity or aesthetics pass.', '',
             f'- Input: `{video}`', f'- Analyzed: {frame_count} frames; ROI: {args.roi}',
             f'- Minimum separation: {args.min_gap} frames', '',
             '| Rank | Frame pair | Approx. seconds | Mean difference | Review frames |',
             '|---:|---:|---:|---:|---:|']
    for item in selected:
        a, b = item['reviewWindowFrames']
        lines.append(f"| {item['rank']} | {item['previousFrame']} → {item['frame']} | {item['secondsApprox']:.3f} | {item['meanAbsoluteDifference']:.4f} | {a}–{b} |")
    lines += ['', 'Only the requested prefix was analyzed.' if args.max_seconds is not None else 'All frames returned by the completed decoder were analyzed.',
              'Review moving objects, occlusion and camera movement around each candidate; a high score alone is not an error.']
    (out / 'motion-continuity.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return summary


def main() -> int:
    try:
        result = run(arguments())
        print(json.dumps({'decodedFrames': result['decodedFrames'],
                          'rankedFrames': result['chronologicalReviewFrames'],
                          'timeSeries': result['timeSeries'], 'qualityVerdict': None}, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f'Motion ranking failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
