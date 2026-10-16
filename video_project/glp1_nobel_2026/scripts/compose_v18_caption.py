"""Replace F5500–F5749 in verified V18; preserve AAC without another encoding.

Default --validate is read-only. --compose archives the verified current video,
validation and QA, replaces one IDR segment, fully verifies every final frame,
copies and verifies every encoded AAC packet, then atomically replaces delivery.
Existing source/public files and previous composer evidence are never modified.

  python scripts/compose_v18_caption.py --patch tmp/.../patch.mp4 --validate
  python scripts/compose_v18_caption.py --patch tmp/.../patch.mp4 --compose

Patch marker defaults to the same stem with .json. Required marker fields:
start=5500, end=5749, path, sha256, sourceLockSHA256. The complete marker is saved
as provenance; optional runner/runnerSHA256 is checked when supplied. --marker
can point at an explicitly named JSON marker. The corrected patch itself may
have been encoded from decoded baseline frames; this script never reencodes it.

Delivery technical.json is updated with precise inheritance provenance and new
subtitle/seam extraction. Visual review remains pending and cannot be approved
by this script; old review.json is preserved before becoming stale.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
from fractions import Fraction
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time

from compose_v18 import (ROOT, OUTPUT, FULL, FPS, FFMPEG, COLOR, TIMESCALE, safe,
                         read_chapters, write_chapters, video_packets)
from verify_idr_splice_v6 import require, sha, run, probe, video_stream, packet_timing, idr_at
from verify_v18_final_revision import make_sheet, boundary_diagnostics, freeze_intervals

START, END = 5500, 5749
EXPECTED_BASE_SHA = '33112564ff05f19cf0296b1f911c041fe25266e1cc5075ca7aaa13b979d45524'
EXPECTED_VALIDATION_SHA = 'b735f7dc1573eadd1b7c4adc3af616bca08e8ebccd485940d6b11478548d2133'
EXPECTED_FRAMEHASH_SHA = 'fc5c01f7421d8a0fde404d7c586d66b7756f2be5d197f18aec1b1959f42b998c'
BASE_DIR = ROOT / 'tmp/v18-compose-caption-base'
WORK = ROOT / 'tmp/v18-compose-caption'
VALIDATION = OUTPUT.with_suffix('.validation.json')
TECHNICAL = ROOT / 'tmp/v18-qa/technical.json'


def now():
    return datetime.now(timezone.utc).isoformat()


def rel(path):
    return Path(path).relative_to(ROOT).as_posix()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_new(path, value):
    with Path(path).open('x', encoding='utf8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def report(path):
    return {'path': rel(path), 'sha256': sha(path)}


def parse_hashes(text, expected_count):
    match = re.search(r'#tb\s+0:\s+(\d+/\d+)', text)
    require(match, 'Missing framehash time base')
    tb = Fraction(match.group(1))
    rows = []
    for line in text.splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        fields = [value.strip() for value in line.split(',')]
        require(len(fields) == 6 and fields[0] == '0', 'Invalid decoded framehash row')
        _dts, pts, duration, size = map(int, fields[1:5])
        require(pts * tb == Fraction(len(rows), FPS) and duration * tb == Fraction(1, FPS),
                f'Decoded PTS/duration differs at F{len(rows)}')
        require(size == 1920 * 1080 * 3 // 2 and re.fullmatch(r'[a-f0-9]{64}', fields[5]),
                'Decoded YUV size/hash differs')
        rows.append(fields[5])
    require(len(rows) == expected_count, 'Decoded frame count differs')
    return rows


def frame_hashes8(path, output, count):
    text = run(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-hwaccel', 'none',
        '-threads', '8', '-i', str(path), '-map', '0:v:0', '-an', '-c:v', 'rawvideo',
        '-pix_fmt', 'yuv420p', '-threads', '8', '-fps_mode', 'passthrough',
        '-f', 'framehash', '-hash', 'sha256', '-'])
    with Path(output).open('x', encoding='utf8') as stream:
        stream.write(text)
    return parse_hashes(text, count)


def audio_packets(path, output):
    """Exact AAC packet bytes, rational timing, codec config and priming metadata."""
    data = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_streams',
        '-show_packets', '-show_data_hash', 'sha256', '-show_entries',
        'stream=codec_name,codec_tag_string,sample_rate,channels,channel_layout,time_base,extradata_hash,start_pts,duration_ts:packet=pts,dts,duration,size,flags,data_hash,side_data_list',
        '-of', 'json', str(path)]))
    require(len(data['streams']) == 1, 'Expected one AAC stream')
    stream = data['streams'][0]
    require(stream['codec_name'] == 'aac' and stream['sample_rate'] == '48000'
            and stream['channels'] == 2, 'Unexpected AAC format')
    tb = Fraction(stream.pop('time_base'))
    stream['startSeconds'] = str(int(stream.pop('start_pts')) * tb)
    stream['durationSeconds'] = str(int(stream.pop('duration_ts')) * tb)
    require(re.fullmatch(r'SHA256:[a-f0-9]{64}', stream.get('extradata_hash', '')),
            'Missing AAC codec config hash')
    rows = []
    for packet in data['packets']:
        require(re.fullmatch(r'SHA256:[a-f0-9]{64}', packet.get('data_hash', '')),
                'Missing AAC payload hash')
        rows.append({**packet, **{name: str(int(packet[name]) * tb) for name in ['pts', 'dts', 'duration']}})
    result = {'stream': stream, 'packetCount': len(rows), 'packets': rows}
    write_new(output, result)
    return result


def preflight(patch, marker):
    watched = {}

    def watch(path, expected=None):
        path = safe(path)
        digest = sha(path)
        require(expected is None or digest == expected, 'Input hash differs: ' + str(path))
        watched[path] = digest
        return path

    watch(OUTPUT, EXPECTED_BASE_SHA)
    watch(VALIDATION, EXPECTED_VALIDATION_SHA)
    old = read(VALIDATION)
    require(old.get('automaticChecksPass') is True and old.get('fullDecodeSuccess') is True
            and old.get('videoSHA256') == EXPECTED_BASE_SHA
            and old['frameCorrespondence'].get('allFramesMatched') is True
            and old['audioComparison'].get('zeroLagVerified') is True,
            'Current V18 is not the completely verified expected base')
    require(old['decodedFrames'] == FULL and old['frameCorrespondence']['totalFrames'] == FULL,
            'Base full-frame proof is incomplete')
    old_hash = watch(old['frameCorrespondence']['final']['path'], EXPECTED_FRAMEHASH_SHA)
    require(old['frameCorrespondence']['final']['sha256'] == EXPECTED_FRAMEHASH_SHA,
            'Base validation framehash identity differs')
    rows = parse_hashes(old_hash.read_text(encoding='utf8'), FULL)
    lock_path = watch(old['sourceLock'], old['sourceLockSHA256'])
    lock = read(lock_path)
    current = {rel(p) for name in ['src', 'public'] for p in (ROOT / name).rglob('*') if p.is_file()}
    require(current == {name for name in lock['hashes'] if name.startswith(('src/', 'public/'))},
            'Current source inventory differs')
    for name, digest in lock['hashes'].items():
        watch(name, digest)
    patch, marker = watch(patch), watch(marker)
    record = read(marker)
    require(record.get('start') == START and record.get('end') == END
            and safe(record['path']) == patch and record.get('sha256') == watched[patch]
            and record.get('sourceLockSHA256') == old['sourceLockSHA256'],
            'Corrected caption patch marker identity differs')
    if 'runner' in record or 'runnerSHA256' in record:
        watch(record['runner'], record['runnerSHA256'])
    for key in ['originalScene', 'correctedCaptionSource', 'mask']:
        require(isinstance(record.get(key), dict), 'Missing caption-composite provenance: ' + key)
        watch(record[key]['path'], record[key]['sha256'])
    require(record.get('changedCaptionGlobalFrame') == 5679
            and record.get('changedCaptionLocalFrame') == 179
            and record.get('captionBoundsXYXY') == [596, 952, 1324, 1042]
            and record.get('sceneRerendered') is False
            and record.get('preencodeRGBOutsideCaptionExactlyUnchanged') is True,
            'Unexpected caption-only repair operation')
    original_full_hash = watch(ROOT / 'tmp/v18-compose-release/base-full.yuv.sha256',
                              '0d8ae42bcf12be02d21da1d51fbc41aa21db7d556daad994fbb1f907c61a9ff3')
    original_rows = parse_hashes(original_full_hash.read_text(encoding='utf8'), FULL)
    for source in [Path(__file__).resolve(), ROOT / 'scripts/compose_v18.py',
                   ROOT / 'scripts/verify_idr_splice_v6.py', ROOT / 'scripts/verify_v18_final_revision.py']:
        watch(source)
    video_stream(patch, END - START + 1, silent=True)
    patch_timing = packet_timing(patch, END - START + 1)
    timing = packet_timing(OUTPUT, FULL)
    require(abs(timing['decodeStartSeconds'] - patch_timing['decodeStartSeconds']) < 1e-9,
            'Caption patch B-frame decode delay differs from base')
    for frame in [0, START, END + 1]:
        require(frame in timing['keyframePresentationFrames'], 'Base boundary is not a keyframe')
        idr_at(OUTPUT, frame)
    idr_at(patch, 0)
    chapters = read_chapters(OUTPUT)
    require(chapters == old['chapters'], 'Base chapters differ from verified report')
    watch(TECHNICAL)
    technical = read(TECHNICAL)
    require(technical.get('technicalPass') is True and technical.get('videoSHA256') == EXPECTED_BASE_SHA,
            'Base technical QA is not for expected verified V18')
    return {'watched': watched, 'old': old, 'rows': rows, 'oldHash': old_hash,
            'patch': patch, 'marker': marker, 'record': record, 'chapters': chapters,
            'technical': technical, 'originalFullHash': original_full_hash, 'originalRows': original_rows}


def unchanged(state):
    for path, digest in state['watched'].items():
        require(sha(path) == digest, 'Input changed during caption composition: ' + str(path))


def archive(state):
    require(not BASE_DIR.exists(), 'Caption base archive already exists; do not overwrite evidence')
    BASE_DIR.mkdir()
    records = []
    inputs = {OUTPUT: BASE_DIR / 'video.mp4', VALIDATION: BASE_DIR / 'validation.json',
              TECHNICAL: BASE_DIR / 'technical.json', state['oldHash']: BASE_DIR / 'final-composed.yuv.sha256'}
    # Preserve previous QA/composition reports, not their large unchanged images.
    for directory in [ROOT / 'tmp/v18-compose-release', ROOT / 'tmp/v18-qa',
                      ROOT / 'tmp/v18-release-patches']:
        for path in directory.rglob('*'):
            if path.is_file() and path.suffix.lower() in {'.json', '.log', '.sha256', '.ffmetadata', '.md'}:
                if 'bundle' not in path.parts and 'frozen' not in path.parts:
                    inputs.setdefault(path, BASE_DIR / 'evidence' / rel(path))
    for source, destination in inputs.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        digest = sha(source)
        with source.open('rb') as a, destination.open('xb') as b:
            shutil.copyfileobj(a, b, 4 * 1024 * 1024)
        require(sha(destination) == digest, 'Archive copy hash differs')
        records.append({'source': rel(source), 'snapshot': rel(destination), 'sha256': digest})
    write_new(BASE_DIR / 'manifest.json', {'createdUTC': now(), 'videoSHA256': EXPECTED_BASE_SHA,
              'validationSHA256': EXPECTED_VALIDATION_SHA, 'files': records,
              'policy': 'Original files retained; verified movie and relevant reports copied before delivery replacement.'})
    return records


def compose(state, work):
    require(not work.exists(), 'Caption work directory exists; use another --work-dir')
    work.mkdir(parents=True)
    commands, started = [], time.monotonic()

    def command(args, label):
        print(label, flush=True)
        commands.append({'label': label, 'command': args})
        return run(args, log=work / (label + '.stderr.log'))

    published = False
    try:
        unchanged(state)
        original_scene = safe(state['record']['originalScene']['path'])
        original_scene_hash_file = work / 'original-scene-5500-5749.yuv.sha256'
        original_scene_rows = frame_hashes8(original_scene, original_scene_hash_file, END - START + 1)
        require(original_scene_rows == state['originalRows'][START:END + 1],
                'The caption patch original scene is not exactly V17 F5500–F5749')
        original_scene_proof = {'all250FramesExactlyMatchV17': True, 'globalFrames': [START, END],
            'originalScene': report(original_scene), 'decodedFrames': report(original_scene_hash_file),
            'fullV17Framehash': report(state['originalFullHash']),
            'frameIndicesAndPTSVerified': True}
        write_new(work / 'caption-original-scene-proof.json', original_scene_proof)
        print('All 250 original input frames exactly match V17 F5500–F5749', flush=True)
        archive_records = archive(state)
        base = BASE_DIR / 'video.mp4'
        patch = state['patch']
        patch_count = END - START + 1
        write_new(work / 'input-lock.json', {'files': [
            {'path': rel(path), 'sha256': digest} for path, digest in state['watched'].items()]})
        command(FFMPEG + ['-i', str(base), '-map', '0:v:0', '-an', '-c:v', 'copy',
            '-map_metadata', '-1', '-map_chapters', '-1', '-avoid_negative_ts', 'disabled',
            '-f', 'segment', '-segment_frames', f'{START},{END + 1}', '-reset_timestamps', '1',
            '-segment_format', 'mp4', '-segment_format_options',
            f'movflags=+faststart+write_colr:video_track_timescale={TIMESCALE}:avoid_negative_ts=disabled',
            str(work / 'base-%02d.mp4')], 'split-verified-base')
        bounds = [(0, START - 1), (START, END), (END + 1, FULL - 1)]
        for i, (s, e) in enumerate(bounds):
            video_stream(work / f'base-{i:02d}.mp4', e - s + 1, silent=True)
            packet_timing(work / f'base-{i:02d}.mp4', e - s + 1)
        patch_hash_file = work / 'patch-5500-5749.yuv.sha256'
        patch_rows = frame_hashes8(patch, patch_hash_file, patch_count)
        expected = state['rows'].copy()
        expected[START:END + 1] = patch_rows
        normalized = work / 'caption.timescale90000.mp4'
        command(FFMPEG + ['-i', str(patch), '-map', '0:v:0', '-an', '-c:v', 'copy',
            '-map_metadata', '-1', '-map_chapters', '-1', '-avoid_negative_ts', 'disabled',
            '-video_track_timescale', str(TIMESCALE), '-movflags', '+faststart+write_colr',
            str(normalized)], 'normalize-caption-timebase')
        video_stream(normalized, patch_count, silent=True)
        packet_timing(normalized, patch_count)
        require(video_packets(patch, work / 'patch-original-packets.json', patch_count)
                == video_packets(normalized, work / 'patch-normalized-packets.json', patch_count),
                'Caption normalization changed payload/timing')
        lines = ['ffconcat version 1.0']
        for file, (s, e) in zip([work / 'base-00.mp4', normalized, work / 'base-02.mp4'], bounds):
            path = file.resolve().as_posix()
            require("'" not in path, 'Unsupported quote in concat path')
            us = round(Fraction((e + 1) * 1000000, FPS)) - round(Fraction(s * 1000000, FPS))
            lines += [f"file '{path}'", f'duration {us // 1000000}.{us % 1000000:06d}']
        concat = work / 'video.ffconcat'
        concat.write_text('\n'.join(lines) + '\n', encoding='utf8')
        silent = work / 'silent-caption.mp4'
        command(FFMPEG + ['-f', 'concat', '-safe', '0', '-auto_convert', '1', '-i', str(concat),
            '-map', '0:v:0', '-an', '-c:v', 'copy', '-map_metadata', '-1', '-map_chapters', '-1',
            '-avoid_negative_ts', 'disabled', '-video_track_timescale', str(TIMESCALE),
            *COLOR, '-movflags', '+faststart+write_colr', str(silent)], 'copy-caption-video-splice')
        video_stream(silent, FULL, silent=True)
        packet_timing(silent, FULL)
        silent_packets = video_packets(silent, work / 'silent-video-packets.json', FULL)
        chapters_file = work / 'chapters.ffmetadata'
        write_chapters(chapters_file, state['chapters'])
        candidate = work / 'V18.caption-candidate.mp4'
        mux = FFMPEG + ['-i', str(silent), '-i', str(base), '-f', 'ffmetadata', '-i', str(chapters_file),
            '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '2', '-map_chapters', '2',
            '-c:v', 'copy', '-c:a', 'copy', '-avoid_negative_ts', 'disabled',
            '-video_track_timescale', str(TIMESCALE), *COLOR, '-movflags', '+faststart+write_colr', str(candidate)]
        command(mux, 'copy-existing-aac-with-chapters')
        require(read_chapters(candidate) == state['chapters'], 'Final chapters changed')
        video = video_stream(candidate, FULL)
        timing = packet_timing(candidate, FULL)
        require(video_packets(candidate, work / 'final-video-packets.json', FULL) == silent_packets,
                'Final mux changed encoded video')
        old_aac = audio_packets(base, work / 'base-aac-packets.json')
        new_aac = audio_packets(candidate, work / 'final-aac-packets.json')
        require(old_aac == new_aac, 'AAC payload/config/PTS/DTS/duration/priming differs')
        print('Full 26738-frame decode and SHA256 correspondence using 8 decoder threads', flush=True)
        final_hash_file = work / 'final-composed.yuv.sha256'
        final_rows = frame_hashes8(candidate, final_hash_file, FULL)
        mismatch = next((i for i, (a, b) in enumerate(zip(final_rows, expected)) if a != b), None)
        require(mismatch is None, f'Final frame differs from expected source at F{mismatch}')
        unchanged(state)
        digest = sha(candidate)
        copy_evidence = {'allEncodedPacketsAndTimingEqual': True, 'codecConfigAndPrimingEqual': True,
            'packetCount': new_aac['packetCount'], 'base': report(work / 'base-aac-packets.json'),
            'final': report(work / 'final-aac-packets.json'), 'encodedAgain': False}
        inherited_audio = copy.deepcopy(state['old']['audioComparison'])
        inherited_audio['inheritedFrom'] = {'videoSHA256': EXPECTED_BASE_SHA,
            'validation': report(BASE_DIR / 'validation.json'), 'basis': 'All encoded AAC packets, rational timing, codec configuration and priming metadata equal',
            'copyEvidence': copy_evidence}
        inherited_audio['newFullPCMComparisonPerformed'] = False
        validation = {
            'finishedUTC': now(), 'seconds': time.monotonic() - started,
            'automaticChecksPass': True, 'fullDecodeSuccess': True, 'decodedFrames': FULL, 'fps': FPS,
            'output': rel(OUTPUT), 'videoSHA256': digest, 'baseline': rel(base), 'baseSHA256': EXPECTED_BASE_SHA,
            'baseCompositionValidation': report(BASE_DIR / 'validation.json'),
            'baseArchive': report(BASE_DIR / 'manifest.json'), 'singlePassRender': False,
            'videoReencoded': False, 'sourceLock': state['old']['sourceLock'],
            'videoReencodedScope': 'This final stream-copy composition only; upstream corrected caption patch was encoded once from original decoded scene frames.',
            'captionOriginalSceneProof': report(work / 'caption-original-scene-proof.json'),
            'sourceLockSHA256': state['old']['sourceLockSHA256'],
            'master': state['old']['master'], 'masterSHA256': state['old']['masterSHA256'],
            'video': video, 'audio': next(s for s in probe(candidate)['streams'] if s['codec_type'] == 'audio'),
            'packetTiming': timing,
            'patches': [{'start': START, 'end': END, 'path': rel(patch), 'sha256': sha(patch),
                        'marker': report(state['marker']), 'provenance': state['record']}],
            'frameCorrespondence': {'allFramesMatched': True, 'totalFrames': FULL,
                'baseFramesMatched': FULL - patch_count, 'patchFramesMatched': patch_count,
                'decodedPresentationTimestampsExact': True, 'pixelFormat': 'yuv420p', 'hash': 'sha256',
                'decoderThreads': 8, 'base': report(BASE_DIR / 'final-composed.yuv.sha256'),
                'patches': [{'start': START, 'end': END, **report(patch_hash_file)}],
                'final': report(final_hash_file),
                'method': 'Every decoded final frame matched the authenticated verified-V18 baseline outside F5500–F5749 or the corrected caption patch inside it.'},
            'audioMux': {'command': mux, 'videoCodec': 'copy', 'audioCodec': 'copy',
                'completeMasterEncodedOnceInAncestor': True, 'encodedAgainInThisRevision': False,
                'source': rel(base), 'sourceSHA256': EXPECTED_BASE_SHA,
                'trimmed': False, 'padded': False, 'timeStretched': False,
                'method': 'Bit-exact AAC stream copy from the already validated V18; no audio encoding in this revision'},
            'audioCopyEvidence': copy_evidence, 'audioComparison': inherited_audio,
            'aacMeasurement': state['old']['aacMeasurement'],
            'aacMeasurementProvenance': {'inheritedFromValidation': report(BASE_DIR / 'validation.json'),
                'basis': 'AAC payload/config/timing equality; no new loudness scan claimed'},
            'chaptersPreserved': True, 'chapterCount': 20, 'chapters': state['chapters'],
            'subjectiveVisualReviewCompleted': False, 'subjectiveAudioReviewCompleted': False,
        }
        write_new(work / 'validation.json', validation)
        # A targeted fresh scan covers the replacement plus a half-second on each
        # side. All remaining decoded pixels are identical to the previous QA video.
        scan_start, scan_end = START - 15, END + 16
        scan_command = ['ffmpeg', '-hide_banner', '-nostdin', '-v', 'info', '-xerror', '-threads', '8',
            '-i', str(candidate), '-map', '0:v:0', '-an', '-vf',
            f'trim=start_frame={scan_start}:end_frame={scan_end},setpts=PTS-STARTPTS,blackdetect=d=0.10:pix_th=0.1:pic_th=0.98,freezedetect=n=-45dB:d=8',
            '-frames:v', str(scan_end - scan_start), '-f', 'null', '-']
        command(scan_command, 'caption-and-seams-detection')
        scan_log = (work / 'caption-and-seams-detection.stderr.log').read_text(encoding='utf8')
        black = [line for line in scan_log.splitlines() if 'black_start:' in line]
        freeze = freeze_intervals(scan_log)
        for event in freeze:
            if event.get('continuesToEOF'):
                event['endSeconds'] = (scan_end - scan_start) / FPS
                event['durationSeconds'] = event['endSeconds'] - event['startSeconds']
        require(not black, 'Unexpected black interval in corrected caption/seams')
        frames = sorted(set([*range(START - 12, START + 12), *range(END - 11, END + 13), *range(5675, 5685)]))
        frame_dir = work / 'frames'
        frame_dir.mkdir()
        filter_path = work / 'frame-filter.txt'
        filter_path.write_text("select='" + '+'.join(f'eq(n,{frame})' for frame in frames) + "'", encoding='utf8')
        command(FFMPEG + ['-threads', '8', '-i', str(candidate), '-map', '0:v:0', '-an',
            '-filter_script:v', str(filter_path), '-fps_mode', 'vfr', '-frames:v', str(len(frames)),
            '-q:v', '2', str(frame_dir / 'extract-%05d.jpeg')], 'extract-caption-and-seams')
        images = sorted(frame_dir.glob('extract-*.jpeg'))
        require(len(images) == len(frames), 'Caption/seam extracted-frame count differs')
        for image, frame in zip(images, frames):
            image.rename(frame_dir / f'frame-{frame:05d}.jpeg')
        sheets, boundary_records = [], []
        for boundary in [START, END + 1]:
            group = list(range(boundary - 12, boundary + 12))
            sheets.append(make_sheet(frame_dir, group, work / f'boundary-{boundary}.jpg', f'Final caption splice F{boundary}'))
            boundary_records.append(boundary_diagnostics(frame_dir, group, boundary, final_rows))
        sheets.append(make_sheet(frame_dir, list(range(5675, 5685)), work / 'caption-5679.jpg', 'Caption correction F5679'))
        write_new(work / 'boundary-evidence.json', {'videoSHA256': digest, 'boundaries': boundary_records,
            'frames': [{'frame': f, 'image': report(frame_dir / f'frame-{f:05d}.jpeg'),
                        'decodedPixelSHA256': final_rows[f]} for f in frames], 'sheets': sheets})
        old_qa = state['technical']
        old_available = sorted(set(old_qa.get('combinedAvailableFrameEvidence', old_qa.get('extractedFrames', []))))
        inherited_frames = [f for f in old_available if not START <= f <= END]
        technical = {
            'revisionVerifier': 'v18-final-caption-splice', 'finishedUTC': now(),
            'video': str(OUTPUT), 'videoSHA256': digest, 'technicalPass': True, 'fullDecode': True,
            'compositionValidation': report(work / 'validation.json'),
            'frameCorrespondence': validation['frameCorrespondence'], 'packetTiming': timing,
            'audioComparison': inherited_audio, 'aacMeasurement': validation['aacMeasurement'],
            'audioCopyEvidence': copy_evidence, 'chapters': state['chapters'], 'chapterCount': 20,
            'blackIntervals': [], 'freezeEventsRequireReview': freeze,
            'freshDetection': {'frames': [scan_start, scan_end - 1], 'command': scan_command,
                'log': report(work / 'caption-and-seams-detection.stderr.log'),
                'timeOffsetSeconds': scan_start / FPS, 'fullFilmScanPerformedThisRevision': False},
            'inheritedDetection': {'sourceVideoSHA256': EXPECTED_BASE_SHA,
                'technical': report(BASE_DIR / 'technical.json'), 'excludedRange': [START, END],
                'basis': 'All 26488 outside-range decoded YUV frames exactly equal the previously scanned video',
                'freezeEventsWithInheritedReview': old_qa.get('freezeEventsWithInheritedReview', []),
                'oldFullScanNotPresentedAsNewFullScan': True},
            'newlyExtractedFrames': frames, 'extractedFrames': frames,
            'inheritedExtractedFrames': inherited_frames,
            'combinedAvailableFrameEvidence': sorted(set(frames + inherited_frames)),
            'inheritedVisualEvidence': {'technical': report(BASE_DIR / 'technical.json'),
                'allListedFramesOutsideReplacementAndPixelIdentical': True,
                'excludedOldFrames': [f for f in old_available if START <= f <= END]},
            'boundaryEvidence': report(work / 'boundary-evidence.json'), 'contactSheets': sheets,
            'visualReview': 'Pending direct review of two final splice sheets and F5679 subtitle; older outside-range pixel-identical evidence retained.',
            'manualFullFilmPlayback': False, 'subjectiveFullAudioListening': False,
        }
        write_new(work / 'technical.json', technical)
        write_new(work / 'commands.json', commands)
        unchanged(state)
        require(sha(BASE_DIR / 'video.mp4') == EXPECTED_BASE_SHA, 'Rollback base changed')
        # Stage every payload on the destination filesystem, then replace. If a
        # later replacement fails, restore all three prior files from the archive.
        destinations = [(candidate, OUTPUT, BASE_DIR / 'video.mp4'),
                        (work / 'validation.json', VALIDATION, BASE_DIR / 'validation.json'),
                        (work / 'technical.json', TECHNICAL, BASE_DIR / 'technical.json')]
        stages = []
        for source, target, backup in destinations:
            stage = target.with_name('.' + target.name + '.caption-installing')
            require(not stage.exists(), 'Stale caption install staging exists')
            with source.open('rb') as a, stage.open('xb') as b:
                shutil.copyfileobj(a, b, 4 * 1024 * 1024)
            require(sha(stage) == sha(source), 'Staged delivery copy differs')
            stages.append((stage, target, backup))
        unchanged(state)
        replaced = []
        try:
            for stage, target, backup in stages:
                os.replace(stage, target)
                replaced.append((target, backup))
            require(sha(OUTPUT) == digest and read(VALIDATION) == validation and read(TECHNICAL) == technical,
                    'Installed caption result differs')
            published = True
        except BaseException:
            for target, backup in reversed(replaced):
                restore = target.with_name('.' + target.name + '.caption-rollback')
                require(not restore.exists(), 'Stale rollback staging exists')
                with backup.open('rb') as a, restore.open('xb') as b:
                    shutil.copyfileobj(a, b, 4 * 1024 * 1024)
                require(sha(restore) == sha(backup), 'Rollback copy differs')
                os.replace(restore, target)
            raise
        write_new(work / 'published.json', {'finishedUTC': now(), 'videoSHA256': digest,
            'output': rel(OUTPUT), 'validation': report(VALIDATION), 'technical': report(TECHNICAL),
            'rollback': report(BASE_DIR / 'manifest.json'), 'visualReleaseApproved': False})
        print(json.dumps({'published': True, 'videoSHA256': digest, 'frames': FULL,
            'replacedFrames': [START, END], 'AACPacketsCopiedExactly': new_aac['packetCount'],
            'audioEncodedAgain': False, 'boundarySheets': sheets,
            'visualReleaseApproved': False}, ensure_ascii=False), flush=True)
    except BaseException as error:
        failure = work / 'failure.json'
        if not failure.exists():
            write_new(failure, {'failedUTC': now(), 'error': str(error), 'commands': commands,
                               'published': published, 'baseArchive': rel(BASE_DIR)})
        raise


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--patch', type=Path, required=True)
    parser.add_argument('--marker', type=Path)
    parser.add_argument('--work-dir', type=Path, default=WORK)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--validate', action='store_true')
    group.add_argument('--compose', action='store_true')
    args = parser.parse_args()
    patch = safe(args.patch)
    marker = safe(args.marker or patch.with_suffix('.json'))
    work = safe(args.work_dir, exists=False)
    require(work.parent == ROOT / 'tmp' and work.name.startswith('v18-compose-caption') and work != BASE_DIR,
            'Caption work must be a new tmp/v18-compose-caption* directory')
    state = preflight(patch, marker)
    if args.compose:
        compose(state, work)
    else:
        unchanged(state)
        print(json.dumps({'validation': 'read-only-pass', 'baseSHA256': EXPECTED_BASE_SHA,
            'patch': rel(patch), 'patchSHA256': sha(patch), 'frames': [START, END],
            'audioPolicy': 'Exact verified AAC copy; no further encoding'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
