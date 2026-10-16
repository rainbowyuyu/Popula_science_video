"""Assemble V11: one new 0–1799 segment, eight copied V10 segments and V10 AAC.

Prepare the opening with:
  node scripts/render_v10.mjs --tag=v11-final --ranges=0-1799
Then run this script. It refuses to replace any delivered V10/V11 video or
completed V11 manifest. The resulting MP4 still needs new-opening visual QA.
"""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import json
from pathlib import Path
import re
import shutil
import uuid

from verify_v11_tail import (
    ROOT, FRAMES, FPS, TAIL_START, V10_SHA256, FFMPEG,
    require, digest, read, save, project_path, run, probe, stream_hash, verify as verify_tail,
)

V10_VIDEO = ROOT / 'delivery/ShanghaiTower_1080p_v10.mp4'
V11_VIDEO = ROOT / 'delivery/ShanghaiTower_1080p_v11.mp4'
V10_MANIFEST = ROOT / 'tmp/v10-final-segments/segments.json'
V10_LOCK = ROOT / 'research/visual/v10-final-lock.json'
V10_MARKER = ROOT / 'tmp/final-render-v10.json'
V11_MARKER = ROOT / 'tmp/final-render-v11.json'
RANGES = [[i * 1800, min(FRAMES - 1, (i + 1) * 1800 - 1)] for i in range(9)]
COMPATIBILITY_FIELDS = (
    'codec_name', 'profile', 'level', 'width', 'height', 'pix_fmt',
    'sample_aspect_ratio', 'avg_frame_rate', 'time_base',
    'color_range', 'color_space', 'color_transfer', 'color_primaries',
    'field_order', 'has_b_frames', 'is_avc', 'nal_length_size', 'extradata',
)
PROTECTED_FILES = {
    'src/timeline.json', 'public/timeline.json', 'src/camera-beats.json',
    'public/master.wav', 'public/music.wav', 'public/narration.wav',
    'package.json', 'package-lock.json',
}
PROTECTED_PREFIXES = ('public/physics/', 'public/models/', 'public/voice/', 'public/fonts/', 'public/brand/')


def rel(path):
    return Path(path).resolve().relative_to(ROOT.resolve()).as_posix()


def file_record(path):
    return {'file': rel(path), 'sha256': digest(path), 'bytes': Path(path).stat().st_size}


def child(base, value):
    path = (base / value).resolve()
    require(path.is_relative_to(base.resolve()), f'Frozen asset path escapes its directory: {value}')
    return path


def verify_lock(path, *, current_sources):
    lock = read(path)
    require(lock.get('frames') == FRAMES and lock.get('fps') == FPS, 'Production lock frame count differs')
    bundle = project_path(lock['bundle'])
    require(bool(lock.get('files')) and bool(lock.get('bundleFiles')), 'Incomplete production lock')
    packed = json.dumps(lock['bundleFiles'], ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    import hashlib
    require(hashlib.sha256(packed).hexdigest() == lock['bundleFingerprint'], 'Bundle fingerprint differs')
    for name, sha in lock['bundleFiles'].items():
        require(digest(child(bundle, name)) == sha, f'Frozen bundle changed: {name}')
    for name, sha in lock['files'].items():
        if name.startswith('public/'):
            require(digest(child(bundle, name)) == sha, f'Frozen public asset changed: {name}')
        if current_sources:
            require(digest(child(ROOT, name)) == sha, f'Current V11 input differs from its lock: {name}')
    return lock


def manifest_binding(manifest, manifest_path, lock, lock_path):
    require(project_path(manifest['productionLock']) == lock_path.resolve(), 'Segment manifest uses another lock')
    require(manifest['productionLockSHA256'] == digest(lock_path), 'Segment manifest lock hash differs')
    require(project_path(manifest['bundle']) == project_path(lock['bundle'])
            and manifest['bundleFingerprint'] == lock['bundleFingerprint'], 'Segment bundle identity differs')
    require(manifest['totalFrames'] == FRAMES and manifest['fps'] == FPS
            and manifest['timelineSHA256'] == lock['files']['src/timeline.json']
            and manifest['masterSHA256'] == lock['files']['public/master.wav'], 'Manifest timeline/master identity differs')
    for row in manifest['segments']:
        path = project_path(row['outputLocation'])
        require(path.is_relative_to(manifest_path.parent.resolve()), 'Segment leaves its source output directory')
        require(digest(path) == row['sha256'], 'Source segment bytes differ from manifest')


def preflight(tag, new_manifest_path, new_lock_path):
    old_lock = verify_lock(V10_LOCK, current_sources=False)
    new_lock = verify_lock(new_lock_path, current_sources=True)
    require(old_lock.get('tag') == 'v10-final' and new_lock.get('tag') == tag, 'Production lock tag differs')
    old, new = read(V10_MANIFEST), read(new_manifest_path)
    require(old.get('status') == 'silent-complete' and old.get('tag') == 'v10-final'
            and old.get('ranges') == RANGES and len(old['segments']) == 9, 'V10 segment source is incomplete')
    require(new.get('status') == 'review-complete' and new.get('tag') == tag
            and new.get('ranges') == [[0, TAIL_START - 1]] and len(new['segments']) == 1,
            'V11 source must be the completed 0–1799 range-only render')
    manifest_binding(old, V10_MANIFEST, old_lock, V10_LOCK)
    manifest_binding(new, new_manifest_path, new_lock, new_lock_path)
    require(old['settings'] == new['settings'], 'New opening render settings differ from reused segments')
    for index, row in enumerate(old['segments']):
        require([row['start'], row['end']] == RANGES[index] and row['frames'] == row['end'] - row['start'] + 1,
                'V10 original segment order/frame count differs')
    require([new['segments'][0]['start'], new['segments'][0]['end']] == [0, TAIL_START - 1],
            'New opening segment range differs')
    all_inputs = set(old_lock['files']) | set(new_lock['files'])
    protected = {name for name in all_inputs if name in PROTECTED_FILES or name.startswith(PROTECTED_PREFIXES)}
    for name in protected:
        require(old_lock['files'].get(name) is not None
                and old_lock['files'].get(name) == new_lock['files'].get(name),
                f'Opening-only release changed protected input: {name}')
    changed = [{'file': name, 'v10SHA256': old_lock['files'].get(name), 'v11SHA256': new_lock['files'].get(name)}
               for name in sorted(all_inputs) if old_lock['files'].get(name) != new_lock['files'].get(name)]

    require(digest(V10_VIDEO) == V10_SHA256, 'Accepted V10 video identity differs')
    marker = read(V10_MARKER)
    require(marker.get('success') is True and marker.get('videoSHA256') == V10_SHA256
            and marker.get('productionLockSHA256') == digest(V10_LOCK)
            and marker.get('masterSHA256') == old['masterSHA256'], 'V10 final mux marker identity differs')
    qa_bindings = []
    for name, field in [('automatic-report.json', 'automaticChecksPass'),
                        ('visual-review.json', 'sampledVisualReviewPass'),
                        ('audio/audio-wave-match.json', 'passed')]:
        path = ROOT / 'research/qa/v10-final' / name
        report = read(path)
        require(report.get(field) is True and report.get('videoSHA256') == V10_SHA256
                and report.get('timelineSHA256') == old['timelineSHA256'], 'V10 final acceptance is missing or stale')
        if field == 'passed':
            require(report.get('selectedMasterSHA256') == old['masterSHA256'], 'V10 AAC report master differs')
        qa_bindings.append(file_record(path))
    return old_lock, new_lock, old, new, changed, qa_bindings


def inspect_segment(path, start, end, out, label):
    info = probe(path, out, label, count_frames=True)
    require(len(info['streams']) == 1, 'Expected a silent video-only source segment')
    video = info['streams'][0]
    require(video['codec_name'] == 'h264' and video['width'] == 1920 and video['height'] == 1080
            and video['avg_frame_rate'] == '30/1' and video['pix_fmt'] == 'yuv420p'
            and int(video['nb_read_frames']) == end - start + 1
            and int(video['nb_frames']) == end - start + 1, 'Source segment format/decoded count differs')
    for field in ['color_space', 'color_transfer', 'color_primaries']:
        require(video[field] == 'bt709', f'Source segment {field} differs')
    require(Fraction(video.get('start_time', '0')) == 0, 'Source segment does not start at zero')
    return {key: video.get(key) for key in COMPATIBILITY_FIELDS}


def exclusive_json(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--tag', default='v11-final', help='New frozen opening tag; must begin with v11-')
    args = parser.parse_args()
    tag = args.tag
    require(re.fullmatch(r'v11-[A-Za-z0-9_-]+', tag) is not None, 'Expected a safe v11-* tag')
    new_manifest_path = ROOT / f'tmp/{tag}-review/segments.json'
    new_lock_path = ROOT / f'research/visual/{tag}-lock.json'
    output_dir = ROOT / f'tmp/{tag}-segments'
    final_manifest_path = output_dir / 'segments.json'
    final_report_path = output_dir / 'mux-report.json'
    for path in [V11_VIDEO, V11_MARKER, final_manifest_path, final_report_path]:
        require(not path.exists(), f'Refusing to overwrite existing V11 release evidence: {path}')
    old_lock, new_lock, old, new, changed, qa_bindings = preflight(tag, new_manifest_path, new_lock_path)
    source_snapshot = {str(path): digest(path) for path in [
        V10_LOCK, new_lock_path, V10_MANIFEST, new_manifest_path, V10_MARKER, V10_VIDEO,
        *[ROOT / row['file'] for row in qa_bindings],
    ]}
    work = output_dir / ('run-' + uuid.uuid4().hex[:12])
    work.mkdir(parents=True, exist_ok=False)
    manifest = {
        'schema': 'rainbow.mixed-source-segments/11', 'tag': tag, 'status': 'staging',
        'startedAtUTC': datetime.now(timezone.utc).isoformat(),
        'productionLock': rel(new_lock_path), 'productionLockSHA256': digest(new_lock_path),
        'newOpeningBundleFingerprint': new_lock['bundleFingerprint'],
        'priorProductionLock': rel(V10_LOCK), 'priorProductionLockSHA256': digest(V10_LOCK),
        'priorBundleFingerprint': old_lock['bundleFingerprint'],
        'newOpeningManifest': rel(new_manifest_path), 'newOpeningManifestSHA256': digest(new_manifest_path),
        'priorManifest': rel(V10_MANIFEST), 'priorManifestSHA256': digest(V10_MANIFEST),
        'timelineSHA256': old['timelineSHA256'], 'masterSHA256': old['masterSHA256'],
        'totalFrames': FRAMES, 'fps': FPS, 'ranges': RANGES, 'settings': old['settings'],
        'rerenderedSegmentNumbers': [1], 'reusedSegmentNumbers': list(range(2, 10)),
        'changedFrozenInputs': changed, 'protectedAudioModelPhysicsInputsUnchanged': True,
        'sourceV10Acceptance': qa_bindings, 'segments': [],
        'scope': 'Intentional mixed-source film: the new bundle supplies frames 0–1799 only; '
                 'the remainder is the unchanged accepted V10 output. No claim that the complete '
                 'V11 bundle was rendered or that its later program state equals V10.',
    }
    identity = None
    for index, limits in enumerate(RANGES):
        reused = index > 0
        source_manifest, source_lock, source_lock_path = (old, old_lock, V10_LOCK) if reused else (new, new_lock, new_lock_path)
        original = source_manifest['segments'][index if reused else 0]
        source = project_path(original['outputLocation'])
        target = work / f'visual-{index + 1:02d}-{limits[0]}-{limits[1]}.mp4'
        with source.open('rb') as incoming, target.open('xb') as outgoing:
            shutil.copyfileobj(incoming, outgoing)
        require(digest(target) == digest(source) == original['sha256'], 'Copied source segment hash differs')
        current = inspect_segment(target, *limits, work, f'segment-{index + 1:02d}')
        if identity is None:
            identity = current
        else:
            mismatches = [key for key in COMPATIBILITY_FIELDS if identity[key] != current[key]]
            require(not mismatches, 'H264 segments are not stream-copy compatible: ' + ', '.join(mismatches))
        manifest['segments'].append({
            'segmentNumber': index + 1, 'start': limits[0], 'end': limits[1],
            'frames': limits[1] - limits[0] + 1, 'outputLocation': str(target),
            'sha256': original['sha256'], 'reused': reused,
            'originVideo': str(source), 'originVideoSHA256': original['sha256'],
            'originTag': source_manifest['tag'], 'originProductionLock': rel(source_lock_path),
            'originProductionLockSHA256': digest(source_lock_path),
            'originBundleFingerprint': source_lock['bundleFingerprint'],
            'originManifest': rel(V10_MANIFEST if reused else new_manifest_path),
            'originManifestSHA256': digest(V10_MANIFEST if reused else new_manifest_path),
        })
    manifest['codecCompatibility'] = identity
    save(work / 'source-manifest.json', manifest)
    playlist = work / 'segments.ffconcat'
    playlist.write_text('ffconcat version 1.0\n' + ''.join(
        "file '" + Path(row['outputLocation']).as_posix().replace("'", "'\\''") + "'\n"
        for row in manifest['segments']), 'utf-8')
    silent, candidate = work / 'silent.mp4', work / 'candidate.mp4'
    run([FFMPEG, '-v', 'error', '-n', '-f', 'concat', '-safe', '0', '-i', playlist,
         '-map', '0:v:0', '-an', '-c:v', 'copy', '-map_metadata', '-1', '-movflags', '+faststart', silent],
        work / 'concat.log')
    # Copy the already accepted AAC, including its encoder priming. Never use
    # shortest, atrim, resampling, offsets or a second lossy audio encode.
    run([FFMPEG, '-v', 'error', '-n', '-i', silent, '-i', V10_VIDEO,
         '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy',
         '-map_metadata', '-1', '-movflags', '+faststart', candidate], work / 'mux.log')
    metadata = probe(candidate, work, 'candidate', count_frames=True)
    require(len(metadata['streams']) == 2, 'Candidate has unexpected streams')
    video = next(row for row in metadata['streams'] if row['codec_type'] == 'video')
    audio = next(row for row in metadata['streams'] if row['codec_type'] == 'audio')
    require(int(video['nb_read_frames']) == FRAMES and Fraction(video['avg_frame_rate']) == FPS,
            'Candidate full decode count/fps differs')
    require(audio['codec_name'] == 'aac' and audio['sample_rate'] == '48000' and audio['channels'] == 2
            and abs(float(audio['duration']) - FRAMES / FPS) < .05, 'Candidate AAC duration/format differs')
    require(stream_hash(silent, 'v', work, 'silent') == stream_hash(candidate, 'v', work, 'candidate'),
            'Final mux changed copied video payload')
    tail = verify_tail(candidate, V10_VIDEO, work / 'tail-proof')
    for path, sha in source_snapshot.items():
        require(digest(path) == sha, 'Source evidence changed while assembling V11')
    verify_lock(new_lock_path, current_sources=True)
    for row in manifest['segments']:
        require(digest(Path(row['originVideo'])) == digest(Path(row['outputLocation'])) == row['sha256'],
                'A copied segment changed before delivery')
    output_hash = digest(candidate)
    require(output_hash == tail['videoSHA256'], 'Candidate changed after tail/AAC proof')
    manifest['status'] = 'silent-complete-mixed-source'
    manifest['finishedAtUTC'] = datetime.now(timezone.utc).isoformat()
    manifest['copiedTailAndAudioProof'] = rel(work / 'tail-proof/tail-audio-identity.json')
    manifest['copiedTailAndAudioProofSHA256'] = digest(work / 'tail-proof/tail-audio-identity.json')
    manifest['audioSource'] = {'video': rel(V10_VIDEO), 'videoSHA256': V10_SHA256,
                               'audioStreamSHA256': tail['audioStreamSHA256'],
                               'completeAACCopied': True, 'audioReencoded': False}
    # The Windows process uses exclusive creation, preserving every prior video.
    # Keep the verified candidate for recovery if a disk-write error interrupts publication.
    with candidate.open('rb') as incoming, V11_VIDEO.open('xb') as outgoing:
        shutil.copyfileobj(incoming, outgoing)
    require(digest(V11_VIDEO) == output_hash, 'Published V11 bytes differ from the verified candidate')
    exclusive_json(final_manifest_path, manifest)
    report = {
        'tag': tag, 'success': True, 'finishedAtUTC': datetime.now(timezone.utc).isoformat(),
        'frames': [0, FRAMES - 1], 'fps': FPS, 'durationSeconds': FRAMES / FPS,
        'outputLocation': str(V11_VIDEO), 'videoSHA256': output_hash,
        'productionLock': str(new_lock_path), 'productionLockSHA256': digest(new_lock_path),
        'mixedSourceManifest': rel(final_manifest_path), 'mixedSourceManifestSHA256': digest(final_manifest_path),
        'newOpeningBundleFingerprint': new_lock['bundleFingerprint'],
        'priorBundleFingerprint': old_lock['bundleFingerprint'],
        'timelineSHA256': old['timelineSHA256'], 'masterSHA256': old['masterSHA256'],
        'seams': [limits[0] for limits in RANGES[1:]], 'allFramesDecoded': True,
        'videoCodecCopied': True, 'audioStreamCopied': True, 'audioReencoded': False,
        'audioSourceVideoSHA256': V10_SHA256, 'audioStreamSHA256': tail['audioStreamSHA256'],
        'copiedTailPacketsIdentical': True, 'decodedTailPixelsIdentical': True,
        'wholeVideoPTSContinuous': True, 'wholeVideoDTSContinuous': True,
        'copyProof': manifest['copiedTailAndAudioProof'], 'copyProofSHA256': manifest['copiedTailAndAudioProofSHA256'],
        'finalVisualAndAACAcceptancePending': True,
        'newOpeningAndSeamVisualReviewPending': True,
        'scripts': [file_record(Path(__file__)), file_record(ROOT / 'scripts/verify_v11_tail.py')],
        'scope': manifest['scope'],
    }
    exclusive_json(final_report_path, report)
    exclusive_json(V11_MARKER, report)
    print(json.dumps({'success': True, 'video': str(V11_VIDEO), 'videoSHA256': output_hash,
                      'reusedSegments': 8, 'audioReencoded': False,
                      'visualAcceptanceStillRequired': True, 'manifest': str(final_manifest_path)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
