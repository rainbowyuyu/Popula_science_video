"""Assemble reviewed V14 opening and unchanged V13 ranges with the complete V13 AAC.

No existing delivery, source lock, old manifest, asset or audio file is changed.
Uses codec-extradata SHA256 (-show_data_hash sha256), not broken raw -show_data.

Required review JSON (written only after actually inspecting encoded segments):
  {"sampledVisualReviewPass":true,"productionLockSHA256":"...",
   "bundleFingerprint":"...","segments":[
     {"start":0,"end":1799,"videoSHA256":"...","passed":true,
      "reviewedFrameNumbers":[0,3,6]}]}
List every rerendered range and only the global frames actually reviewed.
This script does not create a passing visual review on behalf of a reviewer.
"""
import argparse
from datetime import datetime, timezone
import re
import shutil
import uuid

from v12_common import (
    ROOT, FRAMES, FPS, RANGES, V11_VIDEO, V11_SHA, V11_MANIFEST, V11_LOCK,
    FFMPEG, COMPATIBILITY, require, digest, read, save, project_path, rel, record,
    verify_lock, verify_protected, run, probe, check_video, stream_hash,
)
from verify_v14_mix import verify as verify_mix, review_binding
from v14_common import V13_VIDEO, V13_SHA, V13_MANIFEST, V13_MARKER, verify_accepted_v13


def inspect(path, expected, out, label):
    metadata = probe(path, out, label, count=True)
    require(len(metadata['streams']) == 1 and metadata['streams'][0]['codec_type'] == 'video',
            'Source segments must be silent single-video files')
    stream = metadata['streams'][0]
    check_video(stream, expected)
    require(all(key in stream for key in COMPATIBILITY), 'Missing required codec compatibility metadata')
    return {key: stream[key] for key in COMPATIBILITY}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--tag', default='v12-v14-aligned-opening', help='Frozen V12-toolchain tag used for the V14 opening-only delivery')
    parser.add_argument('--review', default='research/qa/v14-release/segments-review.json',
                        help='Actual visual review of each new encoded segment, bound by SHA256')
    args = parser.parse_args()
    tag = args.tag
    require(re.fullmatch(r'v12-[A-Za-z0-9_-]+', tag), 'Use a safe frozen V12 tag')
    lock_path = ROOT / f'research/visual/{tag}-lock.json'
    rendered_manifest_path = ROOT / f'tmp/{tag}-review/segments.json'
    review_path = project_path(args.review)
    final_video = ROOT / 'delivery/ShanghaiTower_1080p_v14.mp4'
    marker_path = ROOT / 'tmp/final-render-v14.json'
    output_dir = ROOT / 'tmp/v14-final-segments'
    final_manifest_path = output_dir / 'segments.json'
    mux_report_path = ROOT / 'delivery/ShanghaiTower_1080p_v14.provenance.json'
    for path in [final_video, marker_path, final_manifest_path, mux_report_path]:
        require(not path.exists(), f'Refusing to replace existing delivery/evidence: {path}')
    old, old_acceptance = verify_accepted_v13()
    prior_lock = verify_lock(V11_LOCK)
    lock = verify_lock(lock_path, current=True)
    verify_protected(prior_lock, lock)
    require(lock['tag'] == tag and lock['parentLockSHA256'] == digest(V11_LOCK)
            and lock['parentManifestSHA256'] == digest(V11_MANIFEST)
            and lock['parentVideoSHA256'] == V11_SHA, 'Frozen V12 parent identity differs')
    affected = lock['rerenderSegmentNumbers']
    require(affected == [1], 'V14 must rerender only opening segment 1')
    new_ranges = [RANGES[n - 1] for n in affected]
    require(lock['rerenderRanges'] == new_ranges, 'Frozen ranges differ from segment plan')
    rendered = read(rendered_manifest_path)
    require(rendered['tag'] == tag and rendered['status'] == 'review-complete'
            and rendered['ranges'] == new_ranges and len(rendered['segments']) == len(new_ranges)
            and rendered['productionLockSHA256'] == digest(lock_path)
            and project_path(rendered['productionLock']) == lock_path.resolve()
            and project_path(rendered['bundle']) == project_path(lock['bundle'])
            and rendered['bundleFingerprint'] == lock['bundleFingerprint'], 'New render binding/ranges differ')
    require(rendered['totalFrames'] == FRAMES and rendered['fps'] == FPS
            and rendered['timelineSHA256'] == old['timelineSHA256'] == lock['files']['src/timeline.json']
            and rendered['masterSHA256'] == old['masterSHA256'] == lock['files']['public/master.wav']
            and rendered['settings'] == old['settings'], 'New render altered protected format/timeline/master')
    new_by_range = {(row['start'], row['end']): row for row in rendered['segments']}
    require(set(new_by_range) == {tuple(row) for row in new_ranges}, 'Missing/duplicated new ranges')
    work = output_dir / ('run-' + uuid.uuid4().hex[:12])
    manifest = {
        'schema': 'rainbow.mixed-source-segments/14', 'tag': tag, 'status': 'staging',
        'startedAtUTC': datetime.now(timezone.utc).isoformat(),
        'productionLock': rel(lock_path), 'productionLockSHA256': digest(lock_path),
        'newBundleFingerprint': lock['bundleFingerprint'],
        'newRenderManifest': record(rendered_manifest_path), 'newSegmentReview': record(review_path),
        'priorManifest': rel(V13_MANIFEST), 'priorManifestSHA256': digest(V13_MANIFEST),
        'priorVideo': rel(V13_VIDEO), 'priorVideoSHA256': V13_SHA,
        'timelineSHA256': old['timelineSHA256'], 'masterSHA256': old['masterSHA256'],
        'totalFrames': FRAMES, 'fps': FPS, 'ranges': RANGES, 'settings': old['settings'],
        'rerenderedSegmentNumbers': affected, 'reusedSegmentNumbers': [n for n in range(1, 10) if n not in affected],
        'protectedBaselineInputsUnchanged': True, 'sourceV13Acceptance': old_acceptance,
        'newlyTrackedInputs': lock.get('newlyTrackedInputs', {}),
        'audioSource': {'video': rel(V13_VIDEO), 'videoSHA256': V13_SHA, 'completeAACCopied': True, 'audioReencoded': False},
        'segments': [],
        'freezeToolchainBaseline': {'video': rel(V11_VIDEO), 'sha256': V11_SHA,
                                    'lock': rel(V11_LOCK), 'lockSHA256': digest(V11_LOCK)},
        'scope': 'V14 rerenders only frames 0-1799. Frames 1800-15711 and complete AAC come from accepted V13, '
                 'including its revised flow slices. Reused ranges retain their actual V13/V11/V10 lineage. '
                 'The freeze_v12 tooling baseline is V11 and does not identify the reused footage. '
                 'Every assembled pixel and all AAC packets require identity verification.',
    }
    copy_sources = []
    for number, bounds in enumerate(RANGES, 1):
        reused = number not in affected
        if reused:
            previous = old['segments'][number - 1]
            source = project_path(previous['outputLocation'])
            row = {key: value for key, value in previous.items()
                   if key.startswith('origin') or key.startswith('reusedFrom')}
            row['reusedFromV13'] = {'manifest': rel(V13_MANIFEST), 'manifestSHA256': digest(V13_MANIFEST),
                                      'video': rel(source), 'sha256': previous['sha256']}
            source_sha = previous['sha256']
        else:
            new = new_by_range[tuple(bounds)]
            source = project_path(new['outputLocation'])
            require(source.is_relative_to(rendered_manifest_path.parent.resolve()), 'New segment escaped its render directory')
            source_sha = new['sha256']
            require(new['frames'] == bounds[1] - bounds[0] + 1, 'New rendered range count differs')
            row = {'originVideo': str(source), 'originVideoSHA256': source_sha, 'originTag': tag,
                   'originProductionLock': rel(lock_path), 'originProductionLockSHA256': digest(lock_path),
                   'originBundleFingerprint': lock['bundleFingerprint'],
                   'originManifest': rel(rendered_manifest_path), 'originManifestSHA256': digest(rendered_manifest_path)}
        require(digest(source) == source_sha, 'Source segment bytes changed')
        target = work / f'visual-{number:02d}-{bounds[0]}-{bounds[1]}.mp4'
        manifest['segments'].append({**row, 'segmentNumber': number, 'start': bounds[0], 'end': bounds[1],
                                     'frames': bounds[1] - bounds[0] + 1, 'outputLocation': str(target),
                                     'sha256': source_sha, 'reused': reused})
        copy_sources.append((source, target))
    review_binding(manifest)
    inputs = {V11_VIDEO, V11_MANIFEST, V11_LOCK, V13_VIDEO, V13_MANIFEST, V13_MARKER,
              lock_path, rendered_manifest_path, review_path, *[source for source, _ in copy_sources]}
    inputs.update(ROOT / row['file'] for row in old_acceptance)
    snapshot = {path: digest(path) for path in inputs}
    work.mkdir(parents=True, exist_ok=False)
    compatibility = None
    for number, ((source, target), row) in enumerate(zip(copy_sources, manifest['segments']), 1):
        with source.open('rb') as incoming, target.open('xb') as outgoing:
            shutil.copyfileobj(incoming, outgoing)
        require(digest(target) == row['sha256'], 'Copied segment differs')
        fields = inspect(target, row['frames'], work, f'segment-{number:02d}')
        if compatibility is None:
            compatibility = fields
        else:
            differences = [key for key in COMPATIBILITY if fields[key] != compatibility[key]]
            require(not differences, 'Segments are not stream-copy compatible: ' + ', '.join(differences))
    manifest['codecCompatibility'] = compatibility
    stage_manifest_path = work / 'source-manifest.json'
    save(stage_manifest_path, manifest, exclusive=True)
    playlist = work / 'segments.ffconcat'
    playlist.write_text('ffconcat version 1.0\n' + ''.join(
        "file '" + target.as_posix().replace("'", "'\\''") + "'\n" for _, target in copy_sources), 'utf-8')
    silent, candidate = work / 'silent.mp4', work / 'candidate.mp4'
    run([FFMPEG, '-v', 'error', '-n', '-f', 'concat', '-safe', '0', '-i', playlist,
         '-map', '0:v:0', '-an', '-c:v', 'copy', '-map_metadata', '-1', '-movflags', '+faststart', silent], work / 'concat.log')
    run([FFMPEG, '-v', 'error', '-n', '-i', silent, '-i', V13_VIDEO,
         '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy',
         '-map_metadata', '-1', '-movflags', '+faststart', candidate], work / 'mux.log')
    require(stream_hash(silent, 'v', work, 'silent') == stream_hash(candidate, 'v', work, 'candidate'),
            'Mux changed video payload')
    proof = verify_mix(candidate, stage_manifest_path, work / 'identity-proof')
    require(proof['passed'], 'Candidate identity verification failed')
    verify_lock(lock_path, current=True)
    require(all(digest(path) == sha for path, sha in snapshot.items()), 'Source changed before publication')
    output_sha = digest(candidate)
    require(output_sha == proof['videoSHA256'], 'Candidate changed after identity proof')
    manifest['status'] = 'complete-mixed-source'
    manifest['finishedAtUTC'] = datetime.now(timezone.utc).isoformat()
    manifest['allFrameAndAudioProof'] = record(work / 'identity-proof/all-frame-audio-identity.json')
    manifest['audioSource']['audioStreamSHA256'] = proof['audioStreamSHA256']
    manifest['stagedManifest'] = record(stage_manifest_path)
    with candidate.open('rb') as incoming, final_video.open('xb') as outgoing:
        shutil.copyfileobj(incoming, outgoing)
    require(digest(final_video) == output_sha, 'Delivery bytes differ from verified candidate')
    save(final_manifest_path, manifest, exclusive=True)
    result = {
        'tag': tag, 'success': True, 'finishedAtUTC': datetime.now(timezone.utc).isoformat(),
        'outputLocation': str(final_video), 'videoSHA256': output_sha,
        'frames': [0, FRAMES - 1], 'fps': FPS, 'durationSeconds': FRAMES / FPS,
        'productionLock': rel(lock_path), 'productionLockSHA256': digest(lock_path),
        'mixedSourceManifest': record(final_manifest_path),
        'timelineSHA256': old['timelineSHA256'], 'masterSHA256': old['masterSHA256'],
        'sourceV13VideoSHA256': V13_SHA, 'rerenderedSegmentNumbers': affected,
        'allFramesCompared': FRAMES, 'newReviewedFramesCompared': proof['newReviewedFramesCompared'],
        'acceptedV13FramesCompared': proof['acceptedV13FramesCompared'],
        'audioReencoded': False, 'completeAACPayloadIdentical': True,
        'aacTimingAndSkipMetadataIdentical': True, 'audioStreamSHA256': proof['audioStreamSHA256'],
        'identityProof': record(work / 'identity-proof/all-frame-audio-identity.json'),
        'stagedManifest': record(stage_manifest_path),
        'seamsToReview': [start for start, _ in RANGES[1:]
                          if start // 1800 in affected or start // 1800 + 1 in affected],
        'finalVisualSeamAndAACAcceptancePending': True,
        'scripts': [record(ROOT / 'scripts' / name) for name in
                    ['freeze_v12.mjs', 'mux_v14.py', 'verify_v14_mix.py', 'v14_common.py', 'v12_common.py']],
        'scope': manifest['scope'],
    }
    save(mux_report_path, result, exclusive=True)
    save(marker_path, result, exclusive=True)
    print({'success': True, 'video': str(final_video), 'sha256': output_sha,
           'comparedFrames': FRAMES, 'audioReencoded': False, 'seamReviewPending': True})


if __name__ == '__main__':
    main()

