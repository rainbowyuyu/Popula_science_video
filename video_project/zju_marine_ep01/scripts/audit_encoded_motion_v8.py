"""Read every encoded video frame for timestamps, duplicates, returns and flow.

This produces review candidates, not a claim of normal-speed human playback.
python scripts/audit_encoded_motion_v8.py FILE.mp4 --out DIR [--expected-frames N]
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

import cv2
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video', type=Path)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--expected-frames', type=int)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    started = time.time()
    probe = json.loads(subprocess.check_output([
        shutil.which('ffprobe') or 'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_streams', '-show_frames', '-show_entries',
        'stream=width,height,avg_frame_rate,duration:frame=best_effort_timestamp_time,pkt_duration_time',
        '-of', 'json', str(args.video)], text=True))
    stream = probe['streams'][0]
    numerator, denominator = map(float, stream['avg_frame_rate'].split('/'))
    fps = numerator / denominator
    timestamps = np.asarray([float(x['best_effort_timestamp_time']) for x in probe['frames']])
    bad_pts = np.flatnonzero(np.abs(np.diff(timestamps) - 1/fps) > .00015) + 1
    process = subprocess.Popen([
        shutil.which('ffmpeg') or 'ffmpeg', '-v', 'error', '-i', str(args.video),
        '-map', '0:v:0', '-an', '-vf', 'scale=320:180:flags=area',
        '-fps_mode', 'passthrough', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    frame_size = 320 * 180
    previous = None
    previous_flow = None
    history = collections.deque(maxlen=12)
    rows, candidates = [], []
    repeat_run, longest_repeat = 0, 0
    frame_index = 0
    while True:
        data = process.stdout.read(frame_size)
        if not data:
            break
        if len(data) != frame_size:
            raise RuntimeError('Truncated decoded frame')
        full = np.frombuffer(data, dtype=np.uint8).reshape((180, 320))
        # Exclude branding and subtitles; retain the main world/teaching area.
        gray = np.ascontiguousarray(full[25:155, 8:312])
        digest = hashlib.sha256(gray).hexdigest()
        row = {'frame': frame_index, 'time': frame_index/fps,
               'meanLuma': float(gray.mean()), 'nearBlackFraction': float((gray < 8).mean())}
        reasons = []
        if previous is not None:
            mad = float(np.abs(gray.astype(np.float32)-previous.astype(np.float32)).mean())
            row['meanAbsoluteDifference'] = mad
            exact_repeat = digest == history[-1][1]
            repeat_run = repeat_run + 1 if exact_repeat else 0
            longest_repeat = max(longest_repeat, repeat_run)
            if exact_repeat:
                reasons.append('exact-main-image-repeat')
            flow = cv2.calcOpticalFlowFarneback(previous, gray, None, .5, 3, 13, 3, 5, 1.1, 0)
            magnitudes = np.linalg.norm(flow, axis=2)
            row['flowMedianPixels'] = float(np.median(magnitudes))
            row['flowP90Pixels'] = float(np.percentile(magnitudes, 90))
            if previous_flow is not None:
                old_mag = np.linalg.norm(previous_flow, axis=2)
                active = (magnitudes > .45) & (old_mag > .45)
                dot = np.sum(flow * previous_flow, axis=2)
                cosine = dot / np.maximum(magnitudes * old_mag, 1e-6)
                row['activeFlowFraction'] = float(active.mean())
                row['reversedFlowFraction'] = float(((cosine < -.65) & active).mean())
                if row['reversedFlowFraction'] > .38 and row['activeFlowFraction'] > .50:
                    reasons.append('large-area-flow-reversal-review')
            previous_flow = flow
            for old_frame, old_digest, _ in history:
                if old_frame < frame_index-1 and old_digest == digest and not exact_repeat:
                    reasons.append(f'exact-return-to-frame-{old_frame}')
            if len(history) >= 2 and mad > 2:
                old_frame, _, old_image = history[-2]
                return_mad = float(np.abs(gray.astype(np.float32)-old_image.astype(np.float32)).mean())
                row['twoFrameReturnDifference'] = return_mad
                if return_mad < .35 and return_mad < mad*.12:
                    reasons.append(f'near-return-to-frame-{old_frame}')
            if mad > 18:
                reasons.append('large-image-step-review')
        if row['nearBlackFraction'] > .97:
            reasons.append('near-black-main-image-review')
        if reasons:
            candidates.append({'frame': frame_index, 'time': row['time'], 'reasons': reasons})
        history.append((frame_index, digest, gray.copy()))
        previous = gray.copy()
        rows.append(row)
        frame_index += 1
        if frame_index % 900 == 0:
            print(json.dumps({'decodedFrames': frame_index, 'candidates': len(candidates)}), flush=True)
    stderr = process.stderr.read().decode('utf-8', 'replace')
    if process.wait() != 0:
        raise RuntimeError('ffmpeg decode failed: '+stderr)
    if len(timestamps) != frame_index:
        raise RuntimeError(f'Probe/decode count mismatch {len(timestamps)}/{frame_index}')
    expected_ok = args.expected_frames is None or args.expected_frames == frame_index
    report = {
        'schema': 'encoded-motion-review-v8', 'video': str(args.video.resolve()),
        'elapsedSeconds': time.time()-started, 'videoStream': stream,
        'decodedFrames': frame_index, 'expectedFrames': args.expected_frames,
        'expectedFrameCountPassed': expected_ok, 'timestampStepPassed': len(bad_pts) == 0,
        'timestampStepAlerts': bad_pts.tolist(), 'longestExactRepeatFrames': longest_repeat,
        'reviewCandidates': candidates, 'metricsFile': 'frame-metrics.json',
        'limitations': [
            'Automated analysis of every decoded frame; not normal-speed human playback.',
            'Flow reversals can be caused by natural waves, blade rotation and legitimate camera changes.',
            'Thresholds identify places to inspect; they do not certify visual beauty or narration alignment.',
            'Main-image ROI excludes top branding and bottom subtitles; test subtitle layout separately.',
            'PTS checks presentation timestamps; B-frame decode order is intentionally not treated as an error.'
        ]}
    (args.out/'frame-metrics.json').write_text(json.dumps(rows, separators=(',', ':')), encoding='utf8')
    (args.out/'encoded-motion-audit.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({k: report[k] for k in ['decodedFrames', 'timestampStepPassed', 'expectedFrameCountPassed', 'longestExactRepeatFrames', 'elapsedSeconds']}), flush=True)
    print(json.dumps({'candidates': len(candidates), 'report': str(args.out/'encoded-motion-audit.json')}), flush=True)
    if not expected_ok or len(bad_pts):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
