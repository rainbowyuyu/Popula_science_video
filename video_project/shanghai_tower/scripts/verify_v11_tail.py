"""Independently verify V11's copied V10 tail and complete original AAC.

This verifies actual encoded files, not equivalence of two Three.js programs.
The new opening and the seam still require a separate visual review.
"""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FRAMES, FPS, TAIL_START = 15712, 30, 1800
V10_SHA256 = 'ce44a4d51522cf4b945e28b858f6938363a7e8f70979004efc971fe561a429f6'
FFMPEG = Path('C:/ffmpeg/bin/ffmpeg.exe')
FFPROBE = Path('C:/ffmpeg/bin/ffprobe.exe')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def save(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'utf-8')


def project_path(value):
    path = Path(value)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT.resolve()), f'Path is outside the project: {value}')
    return path


def run(args, log):
    process = subprocess.run([str(x) for x in args], capture_output=True,
                             text=True, encoding='utf-8', errors='replace')
    Path(log).write_text(process.stdout + '\n' + process.stderr, 'utf-8')
    require(process.returncode == 0, f'Command failed; inspect {log}')
    return process.stdout


def probe(path, out, name, count_frames=False):
    args = [FFPROBE, '-v', 'error']
    if count_frames:
        args += ['-count_frames']
    args += ['-show_streams', '-show_format', '-show_data', '-of', 'json', path]
    return json.loads(run(args, out / f'{name}-probe.log'))


def packets(path, kind, out, name):
    return json.loads(run([
        FFPROBE, '-v', 'error', '-select_streams', kind + ':0', '-show_packets',
        '-show_data_hash', 'sha256', '-show_entries',
        'packet=pts,dts,duration,flags,data_hash:packet_side_data', '-of', 'json', path,
    ], out / f'{name}-{kind}-packets.log'))['packets']


def stream_hash(path, kind, out, name):
    value = run([FFMPEG, '-v', 'error', '-i', path, '-map', '0:' + kind + ':0',
                 '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-'],
                out / f'{name}-{kind}-streamhash.log').strip()
    prefix = '0,' + kind + ',SHA256='
    require(value.startswith(prefix) and len(value) == len(prefix) + 64,
            'Unexpected streamhash output')
    return value[len(prefix):].lower()


def packet_identity(rows, *, include_flags=False):
    fields = ['pts', 'dts', 'duration', 'data_hash']
    if include_flags:
        fields += ['flags']
    return [{**{key: row[key] for key in fields},
             'side_data_list': row.get('side_data_list', [])} for row in rows]


def decoded_tail(path, out, name):
    text = run([
        FFMPEG, '-hide_banner', '-v', 'error', '-xerror', '-i', path,
        '-map', '0:v:0', '-an', '-vf', f'select=gte(n\\,{TAIL_START})',
        '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-f', 'framemd5', '-',
    ], out / f'{name}-tail-framemd5.log')
    rows = []
    for line in text.splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        fields = [x.strip() for x in line.split(',')]
        require(len(fields) == 6, 'Unexpected framemd5 record')
        rows.append({'pts': int(fields[2]), 'duration': int(fields[3]),
                     'bytes': int(fields[4]), 'md5': fields[5]})
    require(len(rows) == FRAMES - TAIL_START, 'Decoded tail frame count differs')
    require([row['pts'] for row in rows] == list(range(TAIL_START, FRAMES)),
            'Decoded tail timestamps differ from the absolute frame range')
    return rows


def verify(video, source, out):
    video, source, out = map(project_path, (video, source, out))
    require(video != source and video.is_file() and source.is_file(), 'Two distinct existing MP4 files are required')
    require(digest(source) == V10_SHA256, 'Source is not the accepted V10 MP4')
    video_sha = digest(video)
    out.mkdir(parents=True, exist_ok=True)
    old_meta, new_meta = probe(source, out, 'v10'), probe(video, out, 'v11')
    streams = {}
    for name, meta in [('v10', old_meta), ('v11', new_meta)]:
        require(len(meta['streams']) == 2, f'{name} must have exactly one video and one audio stream')
        streams[name] = {row['codec_type']: row for row in meta['streams']}
        require(set(streams[name]) == {'video', 'audio'}, f'{name} stream layout differs')
        v, a = streams[name]['video'], streams[name]['audio']
        require(v['codec_name'] == 'h264' and v['width'] == 1920 and v['height'] == 1080
                and Fraction(v['avg_frame_rate']) == FPS and int(v['nb_frames']) == FRAMES,
                f'{name} video format/count differs')
        require(a['codec_name'] == 'aac' and a['sample_rate'] == '48000' and a['channels'] == 2,
                f'{name} AAC format differs')
    for kind in ['video', 'audio']:
        require(streams['v10'][kind]['time_base'] == streams['v11'][kind]['time_base'],
                f'{kind} time base changed during copying')

    old_audio, new_audio = packets(source, 'a', out, 'v10'), packets(video, 'a', out, 'v11')
    require(packet_identity(old_audio) == packet_identity(new_audio),
            'AAC packet payload, PTS/DTS, duration or encoder skip metadata changed')
    old_audio_hash = stream_hash(source, 'a', out, 'v10')
    new_audio_hash = stream_hash(video, 'a', out, 'v11')
    require(old_audio_hash == new_audio_hash, 'AAC stream payload changed')

    old_video, new_video = packets(source, 'v', out, 'v10'), packets(video, 'v', out, 'v11')
    tick = Fraction(streams['v10']['video']['time_base'])
    expected_step = Fraction(1, FPS) / tick
    require(expected_step.denominator == 1, 'Video timebase cannot represent a whole frame')
    for name, rows in [('v10', old_video), ('v11', new_video)]:
        require(len(rows) == FRAMES, f'{name} video packet count differs')
        display = sorted(rows, key=lambda row: int(row['pts']))
        require(all(int(row['pts']) == i * expected_step and int(row['duration']) == expected_step
                    for i, row in enumerate(display)), f'{name} video presentation timestamps are discontinuous')
        require(all(int(b['dts']) - int(a['dts']) == expected_step for a, b in zip(rows, rows[1:])),
                f'{name} decoding timestamps are discontinuous')
        require('K' in display[TAIL_START].get('flags', ''), f'{name} tail does not begin with a keyframe')
    old_tail = [row for row in old_video if int(row['pts']) * tick >= Fraction(TAIL_START, FPS)]
    new_tail = [row for row in new_video if int(row['pts']) * tick >= Fraction(TAIL_START, FPS)]
    require(len(old_tail) == len(new_tail) == FRAMES - TAIL_START, 'Copied video tail packet count differs')
    require(packet_identity(old_tail, include_flags=True) == packet_identity(new_tail, include_flags=True),
            'Copied video tail packet payload or timing differs from V10')
    decoded_old, decoded_new = decoded_tail(source, out, 'v10'), decoded_tail(video, out, 'v11')
    require(decoded_old == decoded_new, 'Decoded tail pixels differ from V10')
    require(digest(video) == video_sha and digest(source) == V10_SHA256, 'A video changed during verification')
    report = {
        'schema': 'rainbow.v11-copied-tail/1', 'passed': True,
        'checkedAtUTC': datetime.now(timezone.utc).isoformat(),
        'video': str(video), 'videoSHA256': video_sha,
        'sourceVideo': str(source), 'sourceVideoSHA256': V10_SHA256,
        'tailFrameRangeInclusive': [TAIL_START, FRAMES - 1],
        'tailFrames': FRAMES - TAIL_START, 'fps': FPS,
        'copiedTailPacketsIdentical': True, 'decodedTailPixelsIdentical': True,
        'audioPacketCount': len(old_audio), 'audioStreamSHA256': old_audio_hash,
        'completeAACPayloadIdentical': True, 'aacTimingAndSkipMetadataIdentical': True,
        'wholeVideoPTSContinuous': True, 'wholeVideoDTSContinuous': True,
        'newOpeningVisualReviewCompleted': False, 'newOpeningSeamVisualReviewCompleted': False,
        'scope': 'Actual assembled file only: all frames 1800–15711 and the complete AAC match accepted V10. '
                 'This does not certify equivalence of the V11 and V10 scene programs after frame 1800, '
                 'nor the visual quality or continuity of the newly rendered opening.',
    }
    save(out / 'tail-audio-identity.json', report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', default='delivery/ShanghaiTower_1080p_v11.mp4', help='V11 MP4 or a staged candidate inside the project')
    parser.add_argument('--source', default='delivery/ShanghaiTower_1080p_v10.mp4', help='Accepted V10 source; its SHA256 is pinned')
    parser.add_argument('--out', default='research/qa/v11-final/tail', help='Directory for packet/decoded-frame evidence')
    args = parser.parse_args()
    report = verify(args.video, args.source, args.out)
    print(json.dumps({k: report[k] for k in ['passed', 'videoSHA256', 'tailFrames',
                                            'decodedTailPixelsIdentical', 'completeAACPayloadIdentical']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
