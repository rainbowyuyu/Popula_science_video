"""Audit a CLOSED V6 MP4 with complete decode, black/silence and actual AAC loudness.

Do not run against a file still being rendered. This script never edits the
video or source. Reports are encoded-audio-v6.json and final-decode-v6.json.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024*1024), b''):
            digest.update(block)
    return digest.hexdigest()


def mono_8khz(path):
    result = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(path), '-map', '0:a:0',
                             '-vn', '-ar', '8000', '-ac', '1', '-c:a', 'pcm_f32le', '-f', 'f32le', '-'],
                            capture_output=True, timeout=300)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf8', errors='replace'))
    return np.frombuffer(result.stdout, dtype='<f4').astype(np.float64)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--master', required=True, type=Path)
    parser.add_argument('--output-dir', type=Path, default=ROOT/'research')
    args = parser.parse_args()
    video, master, output_dir = args.video.resolve(), args.master.resolve(), args.output_dir.resolve()
    if not video.is_file() or not master.is_file():
        raise FileNotFoundError('The selected closed video and master must both exist')
    output_dir.mkdir(parents=True, exist_ok=True)
    initial_stat = video.stat()
    video_hash = sha(video)
    checked_at = datetime.now(timezone.utc).isoformat()
    command = ['ffmpeg', '-nostdin', '-hide_banner', '-xerror', '-err_detect', 'explode', '-i', str(video),
               '-map', '0:v:0', '-map', '0:a:0', '-vf', 'blackdetect=d=0.5:pix_th=0.10:pic_th=0.98',
               '-af', 'silencedetect=noise=-50dB:d=1,loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json',
               '-f', 'null', '-']
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf8', errors='replace', timeout=600)
    log_path = output_dir/'final-decode-v6.ffmpeg.log'
    log_path.write_text(result.stderr, encoding='utf8')
    black = [{'startSec': float(a), 'endSec': float(b), 'durationSec': float(c)} for a, b, c in
             re.findall(r'black_start:([\d.e+-]+)\s+black_end:([\d.e+-]+)\s+black_duration:([\d.e+-]+)', result.stderr)]
    silence_lines = [line.strip() for line in result.stderr.splitlines() if 'silence_start:' in line or 'silence_end:' in line]
    loudness_blocks = []
    for text in re.findall(r'\{[^{}]+\}', result.stderr, re.S):
        try:
            row = json.loads(text)
            if 'input_i' in row:
                loudness_blocks.append(row)
        except json.JSONDecodeError:
            pass
    loudness = loudness_blocks[-1] if loudness_blocks else None
    actual_i = float(loudness['input_i']) if loudness else None
    actual_tp = float(loudness['input_tp']) if loudness else None
    actual_lra = float(loudness['input_lra']) if loudness else None
    check_results = []
    def check(key, passed, detail=None):
        check_results.append({'id': key, 'pass': bool(passed), 'detail': detail})
    check('complete-video-and-audio-decode', result.returncode == 0, result.returncode)
    check('no-black-interval-at-least-half-second', not black, black)
    check('no-silence-at-least-one-second', not silence_lines, silence_lines)
    check('actual-encoded-audio-loudness-measured', loudness is not None)
    check('encoded-loudness-near-minus16-lufs', actual_i is not None and -17 <= actual_i <= -15,
          {'actualLufs': actual_i, 'acceptableRangeLufs': [-17, -15]})
    check('encoded-true-peak-below-minus1-dbtp', actual_tp is not None and actual_tp <= -1,
          {'actualTruePeakDbtp': actual_tp, 'maximumDbtp': -1})
    identity = {'checked': False, 'scope': 'Decoded mono 8 kHz signal comparison identifies selected master content; it does not certify lossless AAC samples.'}
    try:
        reference, encoded = mono_8khz(master), mono_8khz(video)
        common = min(len(reference), len(encoded))
        ref, actual = reference[:common], encoded[:common]
        denominator = float(np.sqrt(np.dot(ref, ref)*np.dot(actual, actual)))
        correlation = float(np.dot(ref, actual)/denominator) if denominator else 0
        gain = float(np.dot(ref, actual)/max(float(np.dot(ref, ref)), 1e-30))
        relative_error = float(np.sqrt(np.mean((actual-gain*ref)**2))/max(np.sqrt(np.mean(actual**2)), 1e-15))
        chunk_rows = []
        for start in range(0, common, 8000*10):
            r, a = ref[start:start+8000*10], actual[start:start+8000*10]
            power = float(np.sqrt(np.dot(r, r)*np.dot(a, a)))
            chunk_rows.append({'startSec': start/8000, 'correlation': float(np.dot(r, a)/power) if power else None})
        minimum_correlation = min((row['correlation'] for row in chunk_rows if row['correlation'] is not None), default=0)
        identity.update(checked=True, sampleRate=8000, referenceFrames=len(reference), encodedFrames=len(encoded),
                        comparedSeconds=common/8000, correlation=correlation, gain=gain, normalizedErrorRms=relative_error,
                        minimumTenSecondCorrelation=minimum_correlation, tenSecondWindows=chunk_rows)
        check('encoded-audio-matches-selected-master', correlation >= .995 and minimum_correlation >= .99 and
              abs(len(reference)-len(encoded))/8000 <= 1/30, identity)
    except Exception as exc:
        check('encoded-audio-matches-selected-master', False, type(exc).__name__+': '+str(exc))
    final_stat = video.stat()
    unchanged = initial_stat.st_size == final_stat.st_size and initial_stat.st_mtime_ns == final_stat.st_mtime_ns and sha(video) == video_hash
    check('video-unchanged-through-audit', unchanged)
    failures = [row['id'] for row in check_results if not row['pass']]
    probe_result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                                   'stream=index,codec_type,codec_name,duration,sample_rate,channels,nb_frames:format=duration',
                                   '-of', 'json', str(video)], capture_output=True, text=True, encoding='utf8', timeout=60)
    probe = json.loads(probe_result.stdout) if probe_result.returncode == 0 else None
    file_meta = {'path': str(video), 'bytes': initial_stat.st_size, 'sha256': video_hash}
    audio = {'schema': 'rainbow.dna.encoded-audio/v6', 'checkedAt': checked_at, 'video': file_meta,
             'status': 'pass' if not failures else 'failed', 'actualEncodedAudio': {'integratedLufs': actual_i,
             'truePeakDbtp': actual_tp, 'loudnessRangeLu': actual_lra}, 'loudnormMeasurement': loudness,
             'measurementNote': 'The loudnorm input_* fields measure the actual decoded AAC. output_* describes the analysis filter output and is not claimed as the encoded file measurement.',
             'silencedetect': {'thresholdDbfs': -50, 'minimumDurationSec': 1, 'events': silence_lines},
             'master': {'path': str(master), 'sha256': sha(master)}, 'decodedMasterComparison': identity,
             'subjectiveListeningChecked': False, 'checks': check_results, 'failedCheckIds': failures}
    decode = {'schema': 'rainbow.dna.final-decode/v6', 'checkedAt': checked_at, 'video': file_meta,
              'status': 'pass' if not failures else 'failed', 'exitCode': result.returncode,
              'command': command, 'log': {'path': str(log_path), 'sha256': sha(log_path)},
              'probe': probe, 'blackdetect': {'minimumDurationSec': .5, 'pixelLuminanceThreshold': .10,
                                            'minimumBlackPixelRatio': .98, 'intervals': black},
              'checks': check_results, 'failedCheckIds': failures,
              'limits': ['No decoded errors or extended black/silent interval is not a visual-quality approval.',
                         'Complete decoding was forced with -xerror -err_detect explode; both primary video and audio streams were mapped.']}
    (output_dir/'encoded-audio-v6.json').write_text(json.dumps(audio, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf8')
    (output_dir/'final-decode-v6.json').write_text(json.dumps(decode, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf8')
    print(json.dumps({'status': decode['status'], 'failedCheckIds': failures, 'actualEncodedAudio': audio['actualEncodedAudio'],
                      'blackIntervals': black, 'silenceEvents': silence_lines, 'decodedMasterCorrelation': identity.get('correlation'),
                      'minimumTenSecondCorrelation': identity.get('minimumTenSecondCorrelation')}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
