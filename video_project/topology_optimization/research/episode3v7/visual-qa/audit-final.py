"""Independent finished-film QA. Does not render, remux, or edit the deliverable.

Usage:
  python research/episode3v7/visual-qa/audit-final.py --plan-only
  python research/episode3v7/visual-qa/audit-final.py --video output/episode3v7/joinery_v7_1080p.mp4

Outputs a JSON audit plus a contact sheet of exact decoded scene-boundary frames.
Machine checks do not replace human motion inspection or listening.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile
from scipy.signal import correlate, correlation_lags

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FPS = 30


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open('rb') as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], log: Path | None = None) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if log:
        log.write_text(proc.stdout + '\n' + proc.stderr, encoding='utf-8')
    if proc.returncode:
        raise RuntimeError(f'{cmd[0]} exited {proc.returncode}: {proc.stderr[-1800:]}')
    return proc


def make_plan(timeline: dict) -> dict:
    scenes = timeline['scenes']
    entries = []
    for s in scenes:
        start, end = s['start'], s['end']
        if start:
            for delta in [-30, -1, 0, 15, 30, 60, 90, 119, 120, 150]:
                frame = start + delta
                if 0 <= frame < timeline['duration']:
                    entries.append({'frame': frame, 'seconds': frame / FPS, 'scene': s['id'],
                                    'purpose': f'boundary {delta:+d}f'})
        for fraction in [.30, .70]:
            frame = int(start + (end - start) * fraction)
            entries.append({'frame': frame, 'seconds': frame / FPS, 'scene': s['id'],
                            'purpose': f'scene {fraction:.0%}'})
    # Keep detail samples attached to the scene, so removal of the 810-frame
    # assembly recap shifts gravity and later samples with the actual narration.
    # There is deliberately no whole-pavilion assembly sample after that edit.
    detail_offsets = {'straight': [389, 849, 1069], 'frame': [449],
                      'bracket': [260, 610], 'hip': [159, 309, 429],
                      'gravity': [366, 806], 'wind': [532, 942],
                      'inverse': [591, 921], 'references': [107]}
    detail_frames = [s['start']+offset for s in scenes
                     for offset in detail_offsets.get(s['id'], [])
                     if s['start']+offset < s['end']]
    straight = next(s for s in scenes if s['id'] == 'straight')
    detail_frames.extend(straight['start'] + offset for offset in [-46, 24, 40])
    for frame in detail_frames:
        if frame < timeline['duration']:
            s = next(s for s in scenes if s['start'] <= frame < s['end'])
            entries.append({'frame': frame, 'seconds': frame / FPS, 'scene': s['id'],
                            'purpose': 'known detail / prior finding'})
    return {'fps': FPS, 'duration_frames': timeline['duration'],
            'duration_seconds': timeline['duration'] / FPS, 'frames': entries,
            'unique_frames': sorted({x['frame'] for x in entries}),
            'motion_ranges': [{'scene': s['id'], 'from': max(0, s['start'] - 30),
                               'to': min(timeline['duration'] - 1, s['start'] + 150)}
                              for s in scenes if s['start']],
            'note': 'Contact sheets certify sampled framing only. Watch motion ranges at real speed and slower speed to judge popping, occlusion and assembly order.'}


def get_float_mono(p: Path) -> tuple[int, np.ndarray]:
    rate, data = wavfile.read(p)
    if data.ndim == 2:
        data = data.mean(axis=1)
    if np.issubdtype(data.dtype, np.integer):
        data = data.astype(np.float32) / np.iinfo(data.dtype).max
    else:
        data = data.astype(np.float32)
    return rate, data


def correlate_window(a: np.ndarray, b: np.ndarray) -> dict:
    n = min(len(a), len(b))
    if n < 32:
        return {'samples': n, 'correlation': None, 'rms_ratio': None, 'reference_dbfs': None}
    a, b = a[:n].astype(np.float64), b[:n].astype(np.float64)
    rms_a, rms_b = float(np.sqrt(np.mean(a*a))), float(np.sqrt(np.mean(b*b)))
    ac, bc = a-a.mean(), b-b.mean()
    den = math.sqrt(float(np.dot(ac, ac) * np.dot(bc, bc)))
    return {'samples': n, 'correlation': float(np.dot(ac, bc) / den) if den > 1e-14 else None,
            'rms_ratio': rms_b/rms_a if rms_a > 1e-9 else None,
            'reference_dbfs': 20*math.log10(max(rms_a, 1e-12))}


def compare_audio(reference: Path, video: Path, out: Path, timeline: dict) -> dict:
    rate = 24000
    ref_wav, got_wav = out/'reference-mono24.wav', out/'final-mono24.wav'
    for src, dest in [(reference, ref_wav), (video, got_wav)]:
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src),
             '-map', '0:a:0', '-ac', '1', '-ar', str(rate), '-c:a', 'pcm_f32le', str(dest)])
    sr_a, ref = get_float_mono(ref_wav)
    sr_b, got = get_float_mono(got_wav)
    assert sr_a == sr_b == rate
    n = min(len(ref), len(got), rate*20)
    corr = correlate(got[:n], ref[:n], mode='full', method='fft')
    lags = correlation_lags(n, n, mode='full')
    use = np.abs(lags) <= rate//2
    lag = int(lags[use][np.argmax(corr[use])])
    ref_offset, got_offset = max(0, -lag), max(0, lag)
    a, b = ref[ref_offset:], got[got_offset:]
    windows = []
    for clip in timeline['clips']:
        start = max(0, round(clip['start']/FPS*rate)-ref_offset)
        end = max(start, round(clip['end']/FPS*rate)-ref_offset)
        windows.append({'id': clip['id'], 'scene': clip['scene'], 'start_frame': clip['start'],
                        'end_frame': clip['end'], **correlate_window(a[start:end], b[start:end])})
    missing = [x for x in windows if x['samples'] < (x['end_frame']-x['start_frame'])/FPS*rate-.05*rate]
    mismatched = [x for x in windows if x['reference_dbfs'] is not None and x['reference_dbfs'] > -50
                  and (x['correlation'] is None or x['correlation'] < .985
                       or x['rms_ratio'] is None or not .94 <= x['rms_ratio'] <= 1.06)]
    n_common = min(len(a), len(b))
    tail = correlate_window(a[max(0, n_common-2*rate):n_common], b[max(0, n_common-2*rate):n_common])
    # These decoded files are reproducible analysis scratch files, not deliverables.
    ref_wav.unlink()
    got_wav.unlink()
    return {'comparison_reference': str(reference), 'reference_sha256': sha256(reference),
            'sample_rate': rate, 'reference_samples': len(ref), 'final_samples': len(got),
            'alignment_lag_samples': lag, 'alignment_lag_ms': lag/rate*1000,
            'duration_delta_seconds': (len(got)-len(ref))/rate,
            'clip_windows': windows, 'missing_or_short_clip_windows': missing,
            'mismatch_windows': mismatched, 'last_two_seconds': tail,
            'pass': not missing and not mismatched and abs(len(got)-len(ref))/rate <= .1
                    and tail['correlation'] is not None and tail['correlation'] >= .98,
            'meaning': 'Waveform match checks that the approved full master survived video export. It does not verify pronunciation or naturalness.'}


def extract_samples(video: Path, plan: dict, out: Path) -> dict:
    dest = out/'frames'
    dest.mkdir(exist_ok=True)
    frames = plan['unique_frames']
    expr = '+'.join(f'eq(n,{f})' for f in frames)
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(video), '-an',
         '-vf', f"select='{expr}',scale=960:540", '-fps_mode', 'vfr', '-q:v', '2',
         str(dest/'sample-%04d.jpg')], out/'sample-extraction.log')
    files = sorted(dest.glob('sample-*.jpg'))
    if len(files) != len(frames):
        raise RuntimeError(f'Expected {len(frames)} sampled frames, got {len(files)}')
    labels = {f: ' / '.join(sorted({x['scene'] for x in plan['frames'] if x['frame'] == f})) for f in frames}
    font_path = Path('C:/Windows/Fonts/arial.ttf')
    font = ImageFont.truetype(str(font_path), 17) if font_path.exists() else ImageFont.load_default()
    contacts = []
    for page in range(math.ceil(len(files)/18)):
        batch = list(zip(frames, files))[page*18:(page+1)*18]
        sheet = Image.new('RGB', (1440, math.ceil(len(batch)/3)*295), '#eee7d8')
        draw = ImageDraw.Draw(sheet)
        for j, (frame, file) in enumerate(batch):
            x, y = (j%3)*480, (j//3)*295
            im = Image.open(file).convert('RGB');im.thumbnail((480,270))
            sheet.paste(im, (x,y+25))
            draw.text((x+8,y+4), f'{frame} | {frame/FPS:.2f}s | {labels[frame]}', font=font, fill='#27372e')
        name = out/f'boundary-contact-{page+1:02d}.jpg'
        sheet.save(name, quality=94)
        contacts.append(str(name))
    (dest/'frame-index.json').write_text(json.dumps([{'file': str(p), 'frame': f} for f,p in zip(frames, files)], indent=2), encoding='utf-8')
    return {'count': len(files), 'contacts': contacts, 'human_review_complete': False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', type=Path, default=ROOT/'output/episode3v7/joinery_v7_1080p.mp4')
    parser.add_argument('--master', type=Path, default=ROOT/'public/episode3v7/master.wav')
    parser.add_argument('--plan-only', action='store_true')
    parser.add_argument('--skip-samples', action='store_true')
    args = parser.parse_args()
    timeline_path = ROOT/'src/episode3v7/timeline.json'
    timeline = json.loads(timeline_path.read_text(encoding='utf-8'))
    plan = make_plan(timeline)
    plan_path = HERE/'final-sample-plan.json'
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.plan_only:
        print(json.dumps({'plan': str(plan_path), 'sample_frames': len(plan['unique_frames']),
                          'motion_ranges': len(plan['motion_ranges'])}, ensure_ascii=False))
        return
    video, master = args.video.resolve(), args.master.resolve()
    if not video.exists() or not master.exists():
        raise SystemExit(f'Final video/master is not ready: {video} / {master}')
    out = HERE/'final'
    out.mkdir(exist_ok=True)
    report = {'created_at': datetime.now(timezone.utc).isoformat(), 'video': str(video),
              'video_sha256': sha256(video), 'timeline_sha256': sha256(timeline_path),
              'human_motion_review_complete': False, 'human_listening_complete': False}
    try:
        print('Checking stream metadata...', flush=True)
        probe = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(video)]).stdout)
        report['probe'] = probe
        vs = next(x for x in probe['streams'] if x['codec_type'] == 'video')
        aus = [x for x in probe['streams'] if x['codec_type'] == 'audio']
        expected = timeline['duration']/FPS
        report['metadata_checks'] = {'size_1920x1080': [vs['width'],vs['height']] == [1920,1080],
                                     'fps_30': vs['r_frame_rate'] == '30/1',
                                     'frames_match': int(vs.get('nb_frames',-1)) == timeline['duration'],
                                     'video_duration_match': abs(float(vs.get('duration',0))-expected) <= 1/FPS+.002,
                                     'audio_present': len(aus) == 1, 'h264': vs['codec_name'] == 'h264',
                                     'yuv420p': vs['pix_fmt'] == 'yuv420p'}
        print('Decoding the complete video and checking black intervals...', flush=True)
        dec = run(['ffmpeg', '-hide_banner', '-v', 'info', '-i', str(video), '-map', '0:v:0',
                   '-an', '-vf', 'blackdetect=d=0.15:pix_th=0.01', '-f', 'null', '-'], out/'full-video-decode.log')
        report['full_video_decode'] = {'exit_code': dec.returncode,
                                      'black_intervals': re.findall(r'black_start:[^\r\n]+', dec.stderr),
                                      'error_terms': re.findall(r'(?im)^.*(?:corrupt|decode error|invalid data).*$' , dec.stderr)}
        print('Measuring final AAC loudness and true peak...', flush=True)
        loud = run(['ffmpeg', '-hide_banner', '-v', 'info', '-i', str(video), '-map', '0:a:0',
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json', '-f', 'null', '-'], out/'final-aac-loudness.log')
        blocks = re.findall(r'\{\s*"input_i"[\s\S]*?\}', loud.stderr)
        metrics = json.loads(blocks[-1]) if blocks else {}
        report['aac_loudness'] = metrics
        report['audio_level_checks'] = {'integrated_lufs_in_range': -18 <= float(metrics.get('input_i',100)) <= -13,
                                        'true_peak_at_most_minus_1_dbfs': float(metrics.get('input_tp',100)) <= -1.0}
        print('Comparing every narration clip against the complete approved master...', flush=True)
        report['audio_completeness'] = compare_audio(master, video, out, timeline)
        if not args.skip_samples:
            print('Extracting exact scene-boundary and detail samples...', flush=True)
            report['samples'] = extract_samples(video, plan, out)
        report['machine_checks_pass'] = (all(report['metadata_checks'].values())
            and not report['full_video_decode']['black_intervals']
            and not report['full_video_decode']['error_terms']
            and all(report['audio_level_checks'].values()) and report['audio_completeness']['pass'])
    except Exception as exc:
        report['machine_checks_pass'] = False
        report['error'] = f'{type(exc).__name__}: {exc}'
        raise
    finally:
        (out/'final-media-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'report': str(out/'final-media-audit.json'), 'machine_checks_pass': report.get('machine_checks_pass',False)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
