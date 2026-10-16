"""Bind the first 1,800 decoded V11 frames to the visually reviewed source.

This is a pixel-identity check, not a new aesthetic or listening assessment.
Only this independent QA script and its evidence outputs are written.
"""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
FRAME_COUNT = 1800
FINAL_FRAME_COUNT = 15712
FPS = 30
REVIEWED_SOURCE_SHA256 = '6e79c5d0a7e9ac5699cd0dee92e246db94466a3f6b81925d2121a0d09bbe5f0a'
REVIEWED_LOCK_SHA256 = 'aaceadca4e179fbfa282cb042205df56a820cdacf1502981209d6cd784430477'
REVIEWED_BUNDLE = '233ae41a7ab66516250a31ee28a8e0fc487e6fa88aa6e8854048300df5b70f7b'
FFMPEG = Path('C:/ffmpeg/bin/ffmpeg.exe')
FFPROBE = Path('C:/ffmpeg/bin/ffprobe.exe')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def read(path):
    return json.loads(path.read_text('utf-8-sig'))


def project_path(value):
    path = Path(value)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT.resolve()), f'Path leaves the project: {value}')
    return path


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'utf-8')


def run(args, log, commands):
    args = [str(arg) for arg in args]
    commands.append(args)
    result = subprocess.run(args, capture_output=True, text=True,
                            encoding='utf-8', errors='replace')
    log.write_text(result.stdout + '\n' + result.stderr, 'utf-8')
    require(result.returncode == 0, f'Command failed; see {log}')
    return result.stdout


def probe(path, expected_frames, log, commands):
    data = json.loads(run([
        FFPROBE, '-v', 'error', '-select_streams', 'v:0', '-show_streams',
        '-of', 'json', path,
    ], log, commands))
    require(len(data.get('streams', [])) == 1, 'Expected one selected video stream')
    stream = data['streams'][0]
    require(stream['width'] == 1920 and stream['height'] == 1080
            and stream['pix_fmt'] == 'yuv420p'
            and Fraction(stream['avg_frame_rate']) == FPS
            and int(stream['nb_frames']) == expected_frames,
            f'Unexpected format or declared frame count: {path}')
    require(Fraction(stream.get('start_time', '0')) == 0,
            'Video does not start at timestamp zero')
    return stream


def decode_opening(path, log, commands):
    output = run([
        FFMPEG, '-hide_banner', '-v', 'error', '-xerror', '-i', path,
        '-map', '0:v:0', '-an', '-frames:v', str(FRAME_COUNT),
        '-fps_mode', 'passthrough', '-c:v', 'rawvideo', '-pix_fmt', 'yuv420p',
        '-f', 'framemd5', '-',
    ], log, commands)
    timebase = re.search(r'^#tb 0:\s*(\d+)/(\d+)\s*$', output, re.M)
    require(timebase and Fraction(int(timebase[1]), int(timebase[2])) == Fraction(1, FPS),
            'Unexpected decoded framemd5 time base')
    rows = []
    for line in output.splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        fields = [field.strip() for field in line.split(',')]
        require(len(fields) == 6 and re.fullmatch(r'[0-9a-f]{32}', fields[5]),
                'Unexpected framemd5 data record')
        row = {
            'stream': int(fields[0]), 'dts': int(fields[1]), 'pts': int(fields[2]),
            'duration': int(fields[3]), 'bytes': int(fields[4]), 'md5': fields[5],
        }
        rows.append(row)
    require(len(rows) == FRAME_COUNT, f'Decoded {len(rows)} frames, expected {FRAME_COUNT}')
    require(all(row['stream'] == 0 and row['pts'] == index and row['dts'] == index
                and row['duration'] == 1 and row['bytes'] == 1920 * 1080 * 3 // 2
                for index, row in enumerate(rows)),
            'Decoded timestamps, raw frame dimensions, or durations differ')
    return rows


def verify(video, source, output):
    video, source, output = map(project_path, (video, source, output))
    require(video.is_file() and source.is_file() and video != source,
            'Two distinct existing video files are required')
    require(output.suffix.lower() == '.json', 'Output must be a JSON report path')
    require(not output.exists(), f'Refusing to replace an existing identity report: {output}')
    manifest_path = ROOT / 'tmp/v11-final-review/segments.json'
    lock_path = ROOT / 'research/visual/v11-final-lock.json'
    manifest = read(manifest_path)
    lock = read(lock_path)
    source_sha = digest(source)
    video_sha = digest(video)
    require(source_sha == REVIEWED_SOURCE_SHA256, 'Source is not the reviewed opening')
    require(digest(lock_path) == REVIEWED_LOCK_SHA256,
            'Production lock differs from the reviewed opening lock')
    require(manifest['productionLockSHA256'] == REVIEWED_LOCK_SHA256
            and manifest['bundleFingerprint'] == lock['bundleFingerprint'] == REVIEWED_BUNDLE,
            'Source manifest and reviewed lock binding differ')
    require(manifest['ranges'] == [[0, FRAME_COUNT - 1]]
            and len(manifest['segments']) == 1
            and project_path(manifest['segments'][0]['outputLocation']) == source
            and manifest['segments'][0]['sha256'] == source_sha,
            'Source segment differs from its reviewed manifest')
    snapshot = {path: digest(path) for path in [video, source, manifest_path, lock_path]}
    output.parent.mkdir(parents=True, exist_ok=True)
    evidence = output.parent / 'opening-identity-evidence'
    evidence.mkdir(parents=True, exist_ok=False)
    commands = []
    report = {
        'schema': 'rainbow.v11-opening-identity/1', 'passed': False,
        'startedAtUTC': datetime.now(timezone.utc).isoformat(),
        'video': str(video), 'videoSHA256': video_sha,
        'sourceVideo': str(source), 'sourceVideoSHA256': source_sha,
        'sourceManifest': str(manifest_path), 'sourceManifestSHA256': snapshot[manifest_path],
        'productionLock': str(lock_path), 'productionLockSHA256': snapshot[lock_path],
        'bundleFingerprint': REVIEWED_BUNDLE,
        'timelineSHA256': manifest['timelineSHA256'],
        'frameRangeInclusive': [0, FRAME_COUNT - 1], 'fps': FPS,
        'expectedFrameCount': FRAME_COUNT, 'comparedFrameCount': 0,
        'scope': 'Exact decoded yuv420p pixel and timing identity for the first 1800 frames '
                 'of the assembled V11 MP4 versus the independently reviewed encoded opening. '
                 'No aesthetic, listening, later-frame or assembly-seam verdict is made here.',
        'commands': commands,
    }
    try:
        report['ffmpegVersion'] = run([FFMPEG, '-version'], evidence / 'ffmpeg-version.log', commands).splitlines()[0]
        report['finalVideoStream'] = probe(video, FINAL_FRAME_COUNT, evidence / 'final-probe.log', commands)
        report['sourceVideoStream'] = probe(source, FRAME_COUNT, evidence / 'source-probe.log', commands)
        source_rows = decode_opening(source, evidence / 'source-opening-framemd5.log', commands)
        final_rows = decode_opening(video, evidence / 'final-opening-framemd5.log', commands)
        mismatches = [index for index, (old, new) in enumerate(zip(source_rows, final_rows))
                      if old != new]
        pixel_mismatches = [index for index, (old, new) in enumerate(zip(source_rows, final_rows))
                            if old['bytes'] != new['bytes'] or old['md5'] != new['md5']]
        report.update({
            'sourceDecodedFrameCount': len(source_rows), 'finalDecodedFrameCount': len(final_rows),
            'comparedFrameCount': len(source_rows), 'matchedFrameCount': len(source_rows) - len(mismatches),
            'mismatchFrameIndices': mismatches, 'pixelMismatchFrameIndices': pixel_mismatches,
            'decodedOpeningPixelsIdentical': not pixel_mismatches,
            'decodedOpeningTimingIdentical': all(
                tuple(old[key] for key in ['pts', 'dts', 'duration'])
                == tuple(new[key] for key in ['pts', 'dts', 'duration'])
                for old, new in zip(source_rows, final_rows)),
        })
        require(not mismatches, f'Decoded opening differs at {len(mismatches)} frames')
        require(all(digest(path) == sha for path, sha in snapshot.items()),
                'A source, final video or identity manifest changed during verification')
        report['inputHashesStable'] = True
        report['passed'] = True
    except Exception as error:
        report['error'] = str(error)
        raise
    finally:
        report['finishedAtUTC'] = datetime.now(timezone.utc).isoformat()
        report['evidence'] = [{'path': str(path), 'sha256': digest(path)}
                              for path in sorted(evidence.iterdir()) if path.is_file()]
        report['scriptSHA256'] = digest(Path(__file__))
        save(output, report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', default='delivery/ShanghaiTower_1080p_v11.mp4')
    parser.add_argument('--source', default='tmp/v11-final-review/visual-01-0-1799.mp4')
    parser.add_argument('--out', default='research/qa/v11-final/opening-identity.json')
    args = parser.parse_args()
    result = verify(args.video, args.source, args.out)
    print(json.dumps({key: result[key] for key in [
        'passed', 'videoSHA256', 'sourceVideoSHA256', 'comparedFrameCount',
        'matchedFrameCount', 'decodedOpeningPixelsIdentical', 'decodedOpeningTimingIdentical',
    ]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
