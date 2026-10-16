"""Shared, non-mutating identity/provenance helpers for the V12 toolchain."""
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FRAMES, FPS, SEGMENT = 15712, 30, 1800
RANGES = [[i, min(i + SEGMENT - 1, FRAMES - 1)] for i in range(0, FRAMES, SEGMENT)]
V11_SHA = 'f7d1dc67519fb5bf6233e063acf5d9e353e63c71511dd9546c27fc8e74cf1486'
V11_VIDEO = ROOT / 'delivery/ShanghaiTower_1080p_v11.mp4'
V11_MANIFEST = ROOT / 'tmp/v11-final-segments/segments.json'
V11_LOCK = ROOT / 'research/visual/v11-final-lock.json'
FFMPEG, FFPROBE = Path('C:/ffmpeg/bin/ffmpeg.exe'), Path('C:/ffmpeg/bin/ffprobe.exe')
COMPATIBILITY = ('codec_name', 'profile', 'level', 'width', 'height', 'pix_fmt',
                 'sample_aspect_ratio', 'avg_frame_rate', 'time_base', 'color_range',
                 'color_space', 'color_transfer', 'color_primaries', 'field_order',
                 'has_b_frames', 'is_avc', 'nal_length_size', 'extradata_hash')


def require(test, message):
    if not test:
        raise RuntimeError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def save(path, value, exclusive=False):
    with Path(path).open('x' if exclusive else 'w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def project_path(value):
    path = Path(value)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT.resolve()), f'Path leaves project: {value}')
    return path


def child(base, value):
    path = (base / value).resolve()
    require(path.is_relative_to(base.resolve()), f'Path leaves frozen directory: {value}')
    return path


def rel(path):
    return project_path(path).relative_to(ROOT.resolve()).as_posix()


def record(path):
    return {'file': rel(path), 'sha256': digest(path), 'bytes': Path(path).stat().st_size}


def protected(name):
    return name.startswith(('public/', 'data/')) or name in {
        'src/timeline.json', 'package.json', 'package-lock.json',
    }


def verify_lock(path, current=False):
    lock = read(path)
    require(lock.get('frames') == FRAMES and lock.get('fps') == FPS, 'Lock duration/fps differs')
    bundle = project_path(lock['bundle'])
    packed = json.dumps(lock['bundleFiles'], ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    require(hashlib.sha256(packed).hexdigest() == lock['bundleFingerprint'], 'Bundle fingerprint differs')
    for name, sha in lock['bundleFiles'].items():
        require(digest(child(bundle, name)) == sha, f'Frozen bundle changed: {name}')
    for name, sha in lock['files'].items():
        if name.startswith('public/'):
            require(digest(child(bundle, name)) == sha, f'Bundled public data changed: {name}')
        if current:
            require(digest(child(ROOT, name)) == sha, f'Current frozen input changed: {name}')
    return lock


def verify_protected(old, new):
    names = {name for name in set(old['files']) | set(new['files']) if protected(name)}
    newly_tracked = {}
    for name in names:
        if old['files'].get(name) is None and (name.startswith('data/') or name == 'package-lock.json'):
            require(new['files'].get(name) is not None, f'New optional input is missing: {name}')
            newly_tracked[name] = new['files'][name]
            continue
        require(old['files'].get(name) is not None
                and old['files'].get(name) == new['files'].get(name),
                f'Protected data/voice/timeline input changed: {name}')
    require(new.get('newlyTrackedInputs', {}) == newly_tracked,
            'First-tracked optional inputs are not accurately declared')


def verify_origin(row):
    """Validate original lineage instead of relabeling a reused V10 segment V12."""
    source = project_path(row['originVideo'])
    lock_path, manifest_path = project_path(row['originProductionLock']), project_path(row['originManifest'])
    require(digest(source) == row['originVideoSHA256'] == row['sha256'], 'Original segment changed')
    require(digest(lock_path) == row['originProductionLockSHA256'], 'Original production lock changed')
    require(digest(manifest_path) == row['originManifestSHA256'], 'Original source manifest changed')
    lock = verify_lock(lock_path)
    require(lock['bundleFingerprint'] == row['originBundleFingerprint'], 'Original bundle differs')
    source_manifest = read(manifest_path)
    matches = [item for item in source_manifest['segments']
               if [item['start'], item['end']] == [row['start'], row['end']]]
    require(len(matches) == 1 and matches[0]['sha256'] == row['sha256']
            and project_path(matches[0]['outputLocation']) == source,
            'Origin is not the stated range in its original manifest')
    require(source_manifest['tag'] == row['originTag'], 'Original tag differs')


def verify_accepted_v11():
    require(digest(V11_VIDEO) == V11_SHA, 'Accepted V11 video changed')
    marker = read(ROOT / 'tmp/final-render-v11.json')
    require(marker.get('success') is True and marker['videoSHA256'] == V11_SHA
            and marker['mixedSourceManifestSHA256'] == digest(V11_MANIFEST)
            and marker['productionLockSHA256'] == digest(V11_LOCK), 'V11 marker binding differs')
    manifest = read(V11_MANIFEST)
    require(manifest['ranges'] == RANGES and len(manifest['segments']) == len(RANGES),
            'V11 mixed-source manifest is incomplete')
    bindings = []
    for name, flag in [('automatic-report.json', 'automaticChecksPass'),
                       ('visual-review.json', 'sampledVisualReviewPass'),
                       ('audio/audio-wave-match.json', 'passed')]:
        path = ROOT / 'research/qa/v11-final' / name
        report = read(path)
        require(report.get(flag) is True and report['videoSHA256'] == V11_SHA
                and report['timelineSHA256'] == manifest['timelineSHA256'], 'V11 acceptance is stale')
        if flag == 'passed':
            require(report['selectedMasterSHA256'] == manifest['masterSHA256'], 'V11 audio master differs')
        bindings.append(record(path))
    for number, row in enumerate(manifest['segments'], 1):
        require(row['segmentNumber'] == number and [row['start'], row['end']] == RANGES[number - 1]
                and row['frames'] == row['end'] - row['start'] + 1
                and digest(project_path(row['outputLocation'])) == row['sha256'], 'V11 segment differs')
    return manifest, bindings


def run(args, log):
    result = subprocess.run([str(arg) for arg in args], capture_output=True,
                            text=True, encoding='utf-8', errors='replace')
    Path(log).write_text(result.stdout + '\n' + result.stderr, 'utf-8')
    require(result.returncode == 0, f'Command failed; see {log}')
    return result.stdout


def probe(path, out, label, count=False):
    args = [FFPROBE, '-v', 'error'] + (['-count_frames'] if count else [])
    # This host's ffprobe crashes on raw -show_data. Hash the same extradata.
    args += ['-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', path]
    data = json.loads(run(args, out / f'{label}-probe.log'))
    for stream in data['streams']:
        if stream.get('codec_name') in ('h264', 'aac'):
            require(int(stream.get('extradata_size', 0)) > 0
                    and re.fullmatch(r'SHA256:[0-9a-f]{64}', stream.get('extradata_hash', '')),
                    'Missing codec-extradata SHA256')
    return data


def check_video(stream, frame_count):
    require(stream['codec_name'] == 'h264' and stream['width'] == 1920
            and stream['height'] == 1080 and stream['pix_fmt'] == 'yuv420p'
            and Fraction(stream['avg_frame_rate']) == FPS and int(stream['nb_frames']) == frame_count,
            'Video format/frame count differs')
    if 'nb_read_frames' in stream:
        require(int(stream['nb_read_frames']) == frame_count, 'Actual decoded frame count differs')
    require(Fraction(stream.get('start_time', '0')) == 0, 'Video start timestamp is not zero')
    require(all(stream.get(name) == 'bt709' for name in ['color_space', 'color_transfer', 'color_primaries']),
            'Video color metadata differs')


def packets(path, kind, out, label):
    return json.loads(run([
        FFPROBE, '-v', 'error', '-select_streams', kind + ':0', '-show_packets',
        '-show_data_hash', 'sha256', '-show_entries',
        'packet=pts,dts,duration,flags,data_hash:packet_side_data', '-of', 'json', path,
    ], out / f'{label}-{kind}-packets.log'))['packets']


def stream_hash(path, kind, out, label):
    text = run([FFMPEG, '-v', 'error', '-i', path, '-map', '0:' + kind + ':0',
                '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-'],
               out / f'{label}-{kind}-streamhash.log').strip()
    prefix = '0,' + kind + ',SHA256='
    require(text.startswith(prefix) and len(text) == len(prefix) + 64, 'Unexpected streamhash')
    return text[len(prefix):].lower()


def decoded(path, expected, out, label):
    text = run([FFMPEG, '-hide_banner', '-v', 'error', '-xerror', '-i', path,
                '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-c:v', 'rawvideo',
                '-pix_fmt', 'yuv420p', '-f', 'framemd5', '-'], out / f'{label}-framemd5.log')
    require(re.search(r'^#tb 0:\s*1/30\s*$', text, re.M), 'Decoded frame timebase differs')
    rows = []
    for line in text.splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        fields = [field.strip() for field in line.split(',')]
        require(len(fields) == 6 and re.fullmatch(r'[0-9a-f]{32}', fields[5]), 'Invalid framemd5 record')
        rows.append({'stream': int(fields[0]), 'dts': int(fields[1]), 'pts': int(fields[2]),
                     'duration': int(fields[3]), 'bytes': int(fields[4]), 'md5': fields[5]})
    require(len(rows) == expected, 'Actual decoded frame count differs')
    require(all(row['stream'] == 0 and row['dts'] == row['pts'] == index
                and row['duration'] == 1 and row['bytes'] == 1920 * 1080 * 3 // 2
                for index, row in enumerate(rows)), 'Decoded frame timing/dimensions differ')
    return rows
