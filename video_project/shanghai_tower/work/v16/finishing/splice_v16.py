"""Patch only closed-GOP envelopes, retaining baseline outer frames and AAC.

prepare: split frozen baseline on exact keyframe boundaries into video-only MP4s.
assemble: replace declared middle segments, copy-concat and mux original AAC.
--dry-run proves the cutting/concat path with unchanged baseline middle segments.
No command in this script encodes video or audio.
"""
from pathlib import Path
from fractions import Fraction
from datetime import datetime, timezone
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT / 'work/v16/finishing'
BASE = WORK / 'baseline'
FPS = 30
NAMES = {'main': 'ShanghaiTower_1080p_v16.mp4', 'vertical': 'ShanghaiTower_1080x1920_v16.mp4'}


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(4194304), b''):
            h.update(part)
    return h.hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def run(cmd, log):
    log = Path(log)
    write(log.with_suffix('.command.json'), cmd)
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    log.with_suffix('.stdout.txt').write_text(result.stdout, encoding='utf-8')
    log.with_suffix('.stderr.txt').write_text(result.stderr, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(f'{log.name} failed with {result.returncode}')
    return result.stdout


def probe(path, log):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], log))


def frames(path, out):
    run(['ffmpeg', '-hide_banner', '-v', 'error', '-xerror', '-y', '-i', str(path), '-map', '0:v:0', '-an', '-f', 'framemd5', str(out)], out.with_suffix('.decode'))
    rows = []
    for line in out.read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        stream, dts, pts, duration, size, digest = [x.strip() for x in line.split(',')]
        rows.append({'pts': int(pts), 'duration': int(duration), 'size': int(size), 'md5': digest})
    return rows


def audio_packets(path, log):
    data = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_packets', '-show_data_hash', 'sha256',
                          '-show_entries', 'packet=pts,dts,duration,size,data_hash,side_data_list', '-of', 'json', str(path)], log))
    return data['packets']


def validate_video(path, count, log, expected_size=None):
    info = probe(path, log)
    streams = [s for s in info['streams'] if s['codec_type'] == 'video']
    assert len(streams) == 1
    video = streams[0]
    assert video['codec_name'] == 'h264'
    assert video['pix_fmt'] == 'yuv420p'
    if expected_size is not None:
        assert [video['width'], video['height']] == expected_size, (path, 'wrong aspect or dimensions')
    assert int(video['nb_frames']) == count, (path, video.get('nb_frames'), count)
    assert Fraction(video['avg_frame_rate']) == FPS
    # MP4 movie duration may round at its 1 kHz movie timescale even while the
    # H.264 track has an exact 30 fps PTS lattice. Verify that lattice below and
    # tolerate only the single-millisecond container rounding here.
    assert abs(float(video['duration']) - count / FPS) <= 0.0011
    packets = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_packets',
                             '-show_entries', 'packet=pts,dts,duration,flags', '-of', 'json', str(path)], log.with_name(log.name + '-packets')))['packets']
    unit = Fraction(video['time_base'])
    pts = sorted(Fraction(p['pts']) * unit * FPS for p in packets)
    assert pts == list(range(count)), (str(path), 'non-contiguous frame PTS')
    dts = [p['dts'] for p in packets]
    assert all(a < b for a, b in zip(dts, dts[1:])), (str(path), 'DTS not increasing')
    assert 'K' in packets[0]['flags'], (str(path), 'first packet not keyframe')
    return {'frames': count, 'fps': FPS, 'timeBase': video['time_base'], 'duration': float(video['duration']),
            'ptsLatticeExact': True, 'strictlyIncreasingDTS': True, 'firstPacketIsKeyframe': True,
            'codec': video['codec_name'], 'width': video['width'], 'height': video['height'],
            'color': {k: video.get(k) for k in ('color_space', 'color_transfer', 'color_primaries')}}


def merged(intervals):
    out = []
    for a, b in sorted(intervals):
        if out and a <= out[-1][1] + 1:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def prepare(kind):
    case = WORK / kind
    case.mkdir(parents=True, exist_ok=True)
    parts = case / 'baseline-segments'
    parts.mkdir(exist_ok=True)
    source = ROOT / 'delivery' / NAMES[kind]
    baseline = BASE / NAMES[kind]
    BASE.mkdir(exist_ok=True)
    if not baseline.exists():
        shutil.copy2(source, baseline)
    color_record = source.with_suffix('.color.json')
    frozen_color_record = BASE / f'{kind}-color.json'
    if color_record.exists() and not frozen_color_record.exists():
        shutil.copy2(color_record, frozen_color_record)
    original_qa = read(BASE / f'{kind}-media.json')
    assert sha(baseline) == original_qa['videoSHA256'], 'Frozen baseline differs from accepted original'
    initial = read(WORK / 'patch-ranges-initial.json')[kind]
    duration = initial['duration']
    envelopes = merged(initial['foundationEnvelope'] + initial['skyEnvelopes'] + initial.get('extraEnvelopes', []))
    boundaries = sorted(set([0, duration] + [n for a, b in envelopes for n in (a, b + 1)]))
    assert all(x in initial['keyframes'] for x in boundaries)
    plan = {'kind': kind, 'fps': FPS, 'durationFrames': duration, 'baseline': str(baseline), 'baselineSHA256': sha(baseline),
            'dimensions': [original_qa['expected']['width'], original_qa['expected']['height']],
            'originalFullRenderMarker': str(BASE / f'{kind}-render.json'), 'envelopes': envelopes, 'boundaries': boundaries,
            'segments': [], 'patches': []}
    for index, (a, b) in enumerate(zip(boundaries, boundaries[1:])):
        is_patch = [a, b - 1] in envelopes
        item = {'index': index, 'frames': [a, b - 1], 'frameCount': b - a, 'baselineSegment': str(parts / f'segment-{index:03d}.mp4'), 'replace': is_patch}
        if is_patch:
            patch_index = len(plan['patches']) + 1
            tag = f'v16-finish-{kind}-{patch_index:02d}'
            item.update(patchId=f'{kind}-{patch_index:02d}', tag=tag,
                        expectedFile=str(ROOT / 'tmp/v16' / f'segment-{a}-{b-1}-{tag}.mp4'),
                        expectedRenderMarker=str(case / f'patch-{patch_index:02d}-render.json'))
            plan['patches'].append(item.copy())
        plan['segments'].append(item)
    # The segment muxer emits only at the already-probed IDR/keyframe times.
    times = ','.join(f'{x / FPS:.10f}' for x in boundaries[1:-1])
    run(['ffmpeg', '-hide_banner', '-v', 'error', '-y', '-i', str(baseline), '-map', '0:v:0', '-an', '-c:v', 'copy',
         '-f', 'segment', '-segment_times', times, '-segment_time_delta', str(1 / (2 * FPS)), '-reset_timestamps', '1',
         '-avoid_negative_ts', 'disabled', str(parts / 'segment-%03d.mp4')], case / 'split-baseline')
    baseline_frames = frames(baseline, case / 'baseline.framemd5')
    assert len(baseline_frames) == duration
    for item in plan['segments']:
        p = Path(item['baselineSegment'])
        item['validation'] = validate_video(p, item['frameCount'], case / f'segment-{item["index"]:03d}-probe', plan['dimensions'])
        item['sha256'] = sha(p)
    plan['baselineDecodedFrames'] = {'path': str(case / 'baseline.framemd5'), 'sha256': sha(case / 'baseline.framemd5'), 'count': len(baseline_frames)}
    packets = audio_packets(baseline, case / 'baseline-audio-packets')
    write(case / 'baseline-audio-packets.json', packets)
    plan['baselineAudioPacketCount'] = len(packets)
    write(case / 'plan.json', plan)
    print(json.dumps({'prepared': kind, 'plan': str(case / 'plan.json'), 'envelopes': envelopes, 'patches': plan['patches']}, ensure_ascii=False), flush=True)


def assemble(kind, dry_run=False):
    case = WORK / kind
    plan = read(case / 'plan.json')
    expected_size = plan.get('dimensions', [1080, 1920] if kind == 'vertical' else [1920, 1080])
    baseline = Path(plan['baseline'])
    assert sha(baseline) == plan['baselineSHA256']
    patch_source = case / 'patch-source.json'
    source_record = None
    if not dry_run:
        assert patch_source.exists(), 'Missing reviewed replacement bundle/source record'
        source_record = read(patch_source)
        assert sha(ROOT / 'research/qa/v16/source-freeze.json') == source_record['sourceFreezeSHA256'], 'Replacement source freeze changed'
        for source_file, expected_hash in source_record['changedSources'].items():
            assert sha(ROOT / source_file) == expected_hash, ('Source changed after replacement bundle', source_file)
    stage = case / ('dry-run.mp4' if dry_run else 'assembled-candidate.mp4')
    prepared = case / ('dry-run-segments' if dry_run else 'new-segments')
    prepared.mkdir(exist_ok=True)
    records = []
    for segment in plan['segments']:
        item = segment.copy()
        original = Path(item['baselineSegment'])
        if item['replace'] and not dry_run:
            replacement = Path(item['expectedFile'])
            marker = read(item['expectedRenderMarker'])
            assert marker.get('success') is True and marker.get('frames') == item['frames'], (item['patchId'], 'bad render marker')
            assert marker.get('composition') == ('ShanghaiTowerV16Vertical' if kind == 'vertical' else 'ShanghaiTowerV16')
            assert Path(marker['outputLocation']).resolve() == replacement.resolve()
            item['replacementOriginalSHA256'] = sha(replacement)
            item['renderMarker'] = marker
            selected = prepared / f'patch-{item["index"]:03d}.mp4'
            run(['ffmpeg', '-hide_banner', '-v', 'error', '-y', '-i', str(replacement), '-map', '0:v:0', '-an', '-c:v', 'copy',
                 '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
                 '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-video_track_timescale', '90000', '-movflags', '+faststart', str(selected)], case / f'normalize-{item["index"]:03d}')
        else:
            selected = original
        item['selectedFile'] = str(selected)
        item['selectedSHA256'] = sha(selected)
        item['selectedValidation'] = validate_video(selected, item['frameCount'], case / f'validate-selected-{item["index"]:03d}', expected_size)
        records.append(item)
    listing = prepared / 'video-concat.ffconcat'
    text = 'ffconcat version 1.0\n'
    for item in records:
        name = Path(item['selectedFile']).as_posix().replace("'", "'\\''")
        text += f"file '{name}'\nduration {item['frameCount'] / FPS:.12f}\n"
    listing.write_text(text, encoding='utf-8')
    # AAC comes from the original complete baseline, with no -shortest cut.
    run(['ffmpeg', '-hide_banner', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing), '-i', str(baseline),
         '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
         '-video_track_timescale', '90000', '-movflags', '+faststart', str(stage)], case / ('dry-run-concat' if dry_run else 'patch-concat'))
    validation = validate_video(stage, plan['durationFrames'], case / ('dry-run-probe' if dry_run else 'assembled-probe'), expected_size)
    assert all(v == 'bt709' for v in validation['color'].values()), 'Final color tags missing'
    actual_frames = frames(stage, case / ('dry-run.framemd5' if dry_run else 'assembled.framemd5'))
    assert len(actual_frames) == plan['durationFrames']
    original_hashes = []
    for line in (case / 'baseline.framemd5').read_text().splitlines():
        if line and not line.startswith('#'):
            original_hashes.append(line.split(',')[-1].strip())
    unchanged = []
    changed = []
    patch_decodes = {}
    for item in records:
        if item['replace'] and not dry_run:
            patch_decodes[item['index']] = frames(Path(item['selectedFile']), case / f'patch-{item["index"]:03d}.framemd5')
        a, b = item['frames']
        for frame in range(a, b + 1):
            actual = actual_frames[frame]['md5']
            if item['replace'] and not dry_run:
                assert actual == patch_decodes[item['index']][frame - a]['md5'], ('Replacement pixel mismatch', frame)
                changed.append(frame)
            else:
                assert actual == original_hashes[frame], ('Baseline pixel mismatch outside patch', frame)
                unchanged.append(frame)
    original_audio = read(case / 'baseline-audio-packets.json')
    actual_audio = audio_packets(stage, case / ('dry-run-audio' if dry_run else 'assembled-audio'))
    assert actual_audio == original_audio, 'AAC payload/timestamps/duration/skip metadata changed'
    report = {'passed': True, 'dryRun': dry_run, 'kind': kind, 'finishedUTC': datetime.now(timezone.utc).isoformat(),
              'baselineSHA256': plan['baselineSHA256'], 'output': str(stage), 'outputSHA256': sha(stage), 'videoValidation': validation,
              'totalFrames': len(actual_frames), 'unchangedOutsidePatchFrames': len(unchanged), 'replacementFramesVerified': len(changed),
              'allFramesCompared': len(unchanged) + len(changed), 'AACPacketsIdentical': True, 'AACPacketCount': len(actual_audio),
              'AACPayloadTimestampsAndSkipMetadataIdentical': True, 'segments': records, 'videoReencodedByAssembler': False, 'audioReencoded': False,
              'scope': 'Every decoded frame compared to its precise original or replacement source. Outer segments copied, new middle segments already rendered. This is pixel/timing identity proof, not subjective seam approval.'}
    if not dry_run:
        report['patchSource'] = {'path': str(patch_source), 'sha256': sha(patch_source), 'content': read(patch_source)}
        report['patchSourceMatchesCurrentFreezeAndChangedSourceFiles'] = True
        destination = ROOT / 'delivery' / NAMES[kind]
        # Original completed render remains protected in baseline. Promote only
        # after all packet/time/frame tests pass.
        os.replace(stage, destination)
        report['output'] = str(destination)
        marker = read(BASE / f'{kind}-render.json')
        marker.update(finished=datetime.now(timezone.utc).isoformat(), composition='ShanghaiTowerV16Vertical' if kind == 'vertical' else 'ShanghaiTowerV16',
                      frames=[0, plan['durationFrames'] - 1], outputLocation=str(destination), success=True,
                      assembly=True, baselineSHA256=plan['baselineSHA256'], videoSHA256=report['outputSHA256'],
                      assemblyManifest=str(case / 'assembly-proof.json'), patchRecords=[x for x in records if x['replace']],
                      patchSource=report['patchSource'],
                      originalFullRenderMarker=str(BASE / f'{kind}-render.json'))
        write(ROOT / f'tmp/v16/v16-{kind}-render.json', marker)
        write(destination.with_suffix('.color.json'), {'success': True, 'video': str(destination), 'fileSHA256': report['outputSHA256'],
              'videoSHA256': report['outputSHA256'], 'finishedUTC': report['finishedUTC'], 'color': validation['color'],
              'method': 'Video-only copy concat of preserved baseline GOPs and independently rendered replacement GOPs; BT.709 VUI and container tags retained.',
              'videoReencodedByAssembler': False, 'audioReencoded': False, 'assemblyManifest': str(case / 'assembly-proof.json'),
              'historicalColorRecord': str(BASE / f'{kind}-color.json') if (BASE / f'{kind}-color.json').exists() else None})
    write(case / ('dry-run-proof.json' if dry_run else 'assembly-proof.json'), report)
    print(json.dumps({k: report[k] for k in ('passed', 'dryRun', 'kind', 'output', 'outputSHA256', 'unchangedOutsidePatchFrames', 'replacementFramesVerified', 'AACPacketsIdentical')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'assemble'])
    parser.add_argument('--kind', choices=['main', 'vertical'], required=True)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.action == 'prepare':
        prepare(args.kind)
    else:
        assemble(args.kind, args.dry_run)
