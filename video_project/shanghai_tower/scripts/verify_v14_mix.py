"""Verify V14 opening against reviewed render and all remaining frames against V13.

Rerendered ranges must match their reviewed encoded segments. Every other frame
must match accepted V13 (including the revised CFD slices). Complete AAC payload, timing and priming stay identical.
This verifies file identity, not subjective aesthetics or seam smoothness.
"""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import re

from v12_common import (
    ROOT, FRAMES, FPS, RANGES, V11_VIDEO, V11_SHA, V11_MANIFEST, V11_LOCK,
    require, digest, read, save, project_path, record, verify_lock, verify_origin,
    verify_protected, probe, check_video, decoded, packets, stream_hash,
)
from v14_common import (
    V13_VIDEO, V13_SHA, V13_MANIFEST, V13_PROVENANCE, V13_ACCEPTANCE, V13_MARKER,
    checked_record, verify_accepted_v13,
)


def review_binding(manifest):
    path = project_path(manifest['newSegmentReview']['file'])
    require(digest(path) == manifest['newSegmentReview']['sha256'], 'New segment review changed')
    review = read(path)
    require(review.get('sampledVisualReviewPass') is True
            and review.get('productionLockSHA256') == manifest['productionLockSHA256']
            and review.get('bundleFingerprint') == manifest['newBundleFingerprint'],
            'New visual review is missing or bound to another bundle/lock')
    expected = {tuple(RANGES[n - 1]) for n in manifest['rerenderedSegmentNumbers']}
    reviewed = {tuple([row['start'], row['end']]): row for row in review.get('segments', [])}
    require(set(reviewed) == expected and len(review.get('segments', [])) == len(expected),
            'Review must enumerate each rerendered range once')
    for row in manifest['segments']:
        if not row['reused']:
            item = reviewed[row['start'], row['end']]
            require(item.get('passed') is True and item.get('videoSHA256') == row['sha256'],
                    'Rerendered segment review has no passing bound hash')
            require(isinstance(item.get('reviewedFrameNumbers'), list)
                    and len(item['reviewedFrameNumbers']) > 0
                    and all(isinstance(f, int) and row['start'] <= f <= row['end']
                            for f in item['reviewedFrameNumbers']),
                    'Visual review must record the actual global frames inspected')
    return path


def validate_manifest(manifest):
    require(manifest.get('schema') == 'rainbow.mixed-source-segments/14'
            and manifest['ranges'] == RANGES and manifest['totalFrames'] == FRAMES
            and manifest['fps'] == FPS and len(manifest['segments']) == len(RANGES),
            'Incomplete or wrong V14 mixed-source manifest')
    affected = manifest['rerenderedSegmentNumbers']
    require(affected == [1], 'V14 may rerender only opening segment 1')
    old, acceptance_records = verify_accepted_v13()
    require(manifest['priorManifestSHA256'] == digest(V13_MANIFEST)
            and project_path(manifest['priorManifest']) == V13_MANIFEST.resolve()
            and manifest['priorVideoSHA256'] == V13_SHA
            and project_path(manifest['priorVideo']) == V13_VIDEO.resolve(), 'V13 parent binding differs')
    require(manifest['reusedSegmentNumbers'] == list(range(2, 10))
            and manifest['sourceV13Acceptance'] == acceptance_records
            and project_path(manifest['audioSource']['video']) == V13_VIDEO.resolve()
            and manifest['audioSource']['videoSHA256'] == V13_SHA
            and manifest['audioSource']['audioReencoded'] is False
            and manifest['audioSource']['completeAACCopied'] is True,
            'V13 reused ranges, acceptance or audio source differs')
    lock_path = project_path(manifest['productionLock'])
    require(digest(lock_path) == manifest['productionLockSHA256'], 'V14 render lock changed')
    lock = verify_lock(lock_path)
    verify_protected(verify_lock(V11_LOCK), lock)
    require(lock['parentLockSHA256'] == digest(V11_LOCK)
            and lock['parentManifestSHA256'] == digest(V11_MANIFEST)
            and lock['parentVideoSHA256'] == V11_SHA, 'Frozen V12 parent identity differs')
    require(lock['bundleFingerprint'] == manifest['newBundleFingerprint']
            and lock['rerenderSegmentNumbers'] == affected
            and lock['rerenderRanges'] == [RANGES[n - 1] for n in affected], 'V14 locked plan differs')
    require(lock['files']['src/timeline.json'] == manifest['timelineSHA256'] == old['timelineSHA256']
            and lock['files']['public/master.wav'] == manifest['masterSHA256'] == old['masterSHA256'],
            'Timeline/master changed')
    render_path = checked_record(manifest['newRenderManifest'])
    rendered = read(render_path)
    require(rendered['status'] == 'review-complete' and rendered['tag'] == lock['tag'] == manifest['tag']
            and rendered['productionLockSHA256'] == manifest['productionLockSHA256']
            and rendered['bundleFingerprint'] == manifest['newBundleFingerprint']
            and rendered['ranges'] == [RANGES[0]] and len(rendered['segments']) == 1
            and rendered['settings'] == manifest['settings'] == old['settings'],
            'New rendered opening binding or settings differ')
    for number, row in enumerate(manifest['segments'], 1):
        require(row['segmentNumber'] == number and [row['start'], row['end']] == RANGES[number - 1]
                and row['frames'] == row['end'] - row['start'] + 1
                and row['reused'] == (number not in affected)
                and digest(project_path(row['outputLocation'])) == row['sha256'], 'Segment plan/hash differs')
        verify_origin(row)
        if row['reused']:
            previous = old['segments'][number - 1]
            fields = ['sha256', 'originVideo', 'originVideoSHA256', 'originTag',
                      'originProductionLock', 'originProductionLockSHA256', 'originBundleFingerprint',
                      'originManifest', 'originManifestSHA256']
            require(all(row[key] == previous[key] for key in fields), 'Reused segment lost original lineage')
            immediate = row['reusedFromV13']
            require(project_path(immediate['manifest']) == V13_MANIFEST.resolve()
                    and immediate['manifestSHA256'] == digest(V13_MANIFEST)
                    and project_path(immediate['video']) == project_path(previous['outputLocation'])
                    and immediate['sha256'] == previous['sha256'],
                    'Reused segment did not come from the accepted V13 segment')
        else:
            require(row['originProductionLockSHA256'] == manifest['productionLockSHA256']
                    and row['originBundleFingerprint'] == manifest['newBundleFingerprint']
                    and project_path(row['originManifest']) == render_path
                    and row['sha256'] == rendered['segments'][0]['sha256'],
                    'New segment does not come from the V14 render lock')
    return review_binding(manifest)


def packet_key(row, flags=False):
    keys = ['pts', 'dts', 'duration', 'data_hash'] + (['flags'] if flags else [])
    require(re.fullmatch(r'SHA256:[0-9a-f]{64}', row.get('data_hash', '')), 'Missing packet data SHA256')
    return ({key: row[key] for key in keys}, row.get('side_data_list', []))


def verify(video, manifest_path, out):
    video, manifest_path, out = map(project_path, (video, manifest_path, out))
    require(video.is_file() and video not in (V13_VIDEO.resolve(), V11_VIDEO.resolve()), 'Expected distinct assembled V14 file')
    require(not out.exists(), 'Evidence output already exists; use a distinct output directory')
    manifest = read(manifest_path)
    review_path = validate_manifest(manifest)
    lock_path = project_path(manifest['productionLock'])
    inputs = {video, manifest_path, review_path, lock_path, V13_VIDEO, V13_MANIFEST,
              V13_PROVENANCE, V13_ACCEPTANCE, V13_MARKER}
    for row in manifest['segments']:
        inputs.update(project_path(row[key]) for key in ['outputLocation', 'originVideo', 'originManifest', 'originProductionLock'])
    snapshot = {path: digest(path) for path in inputs}
    out.mkdir(parents=True, exist_ok=False)
    report = {
        'schema': 'rainbow.v14-all-frame-source-identity/1', 'passed': False,
        'startedAtUTC': datetime.now(timezone.utc).isoformat(),
        'video': str(video), 'videoSHA256': snapshot[video],
        'sourceV13Video': str(V13_VIDEO), 'sourceV13VideoSHA256': V13_SHA,
        'mixedSourceManifest': record(manifest_path), 'newSegmentReview': record(review_path),
        'productionLockSHA256': snapshot[lock_path], 'bundleFingerprint': manifest['newBundleFingerprint'],
        'timelineSHA256': manifest['timelineSHA256'], 'masterSHA256': manifest['masterSHA256'],
        'totalFrames': FRAMES, 'fps': FPS, 'frameComparisons': [],
        'scope': 'All actual encoded V14 frames are decoded and compared to the reviewed new segments '
                 'or accepted V13 according to the manifest. This identity proof makes no subjective '
                 'visual/audio judgment and does not approve transition seams.',
    }
    try:
        old_meta, new_meta = probe(V13_VIDEO, out, 'v13'), probe(video, out, 'v14')
        for name, meta in [('v13', old_meta), ('v14', new_meta)]:
            require(len(meta['streams']) == 2
                    and {s['codec_type'] for s in meta['streams']} == {'video', 'audio'}, 'Unexpected stream layout')
            v = next(s for s in meta['streams'] if s['codec_type'] == 'video')
            a = next(s for s in meta['streams'] if s['codec_type'] == 'audio')
            check_video(v, FRAMES)
            require(a['codec_name'] == 'aac' and a['sample_rate'] == '48000' and a['channels'] == 2,
                    'AAC format differs')
        old_streams = {s['codec_type']: s for s in old_meta['streams']}
        new_streams = {s['codec_type']: s for s in new_meta['streams']}
        require(all(old_streams[k]['time_base'] == new_streams[k]['time_base'] for k in old_streams),
                'Stream timebase changed')
        require(old_streams['audio']['extradata_hash'] == new_streams['audio']['extradata_hash'], 'AAC extradata changed')
        old_audio, new_audio = packets(V13_VIDEO, 'a', out, 'v13'), packets(video, 'a', out, 'v14')
        require([packet_key(x) for x in old_audio] == [packet_key(x) for x in new_audio],
                'AAC payload, timing, duration or encoder skip metadata changed')
        audio_sha = stream_hash(V13_VIDEO, 'a', out, 'v13')
        require(stream_hash(video, 'a', out, 'v14') == audio_sha, 'AAC stream payload differs')
        old_packets, new_packets = packets(V13_VIDEO, 'v', out, 'v13'), packets(video, 'v', out, 'v14')
        step = Fraction(1, FPS) / Fraction(new_streams['video']['time_base'])
        require(step.denominator == 1, 'Video timebase cannot represent frame boundaries')
        for name, rows in [('v13', old_packets), ('v14', new_packets)]:
            require(len(rows) == FRAMES, f'{name} video packet count differs')
            display = sorted(rows, key=lambda item: int(item['pts']))
            require(all(int(row['pts']) == i * step and int(row['duration']) == step
                        for i, row in enumerate(display)), f'{name} PTS/duration discontinuity')
            require(all(int(b['dts']) - int(a['dts']) == step for a, b in zip(rows, rows[1:])),
                    f'{name} DTS discontinuity')
        old_by_pts = {int(row['pts']): row for row in old_packets}
        new_by_pts = {int(row['pts']): row for row in new_packets}
        prior_frames = decoded(V13_VIDEO, FRAMES, out, 'v13-all')
        final_frames = decoded(video, FRAMES, out, 'v14-all')
        changed_count = reused_count = 0
        for row in manifest['segments']:
            start, end = row['start'], row['end']
            if row['reused']:
                comparison = prior_frames[start:end + 1]
                mismatches = [start + i for i, expected in enumerate(comparison)
                              if final_frames[start + i] != expected]
                require(all(packet_key(old_by_pts[int(frame * step)], True)
                            == packet_key(new_by_pts[int(frame * step)], True)
                            for frame in range(start, end + 1)), 'Reused segment video packets differ from V13')
                reference = {'video': str(V13_VIDEO), 'sha256': V13_SHA, 'frameRangeInclusive': [start, end]}
                reused_count += len(comparison)
            else:
                source = project_path(row['originVideo'])
                comparison = decoded(source, row['frames'], out, f'new-{row["segmentNumber"]:02d}')
                mismatches = []
                for index, expected in enumerate(comparison):
                    shifted = {**expected, 'pts': expected['pts'] + start, 'dts': expected['dts'] + start}
                    if final_frames[start + index] != shifted:
                        mismatches.append(start + index)
                reference = {'video': str(source), 'sha256': row['sha256'], 'frameRangeInclusive': [0, row['frames'] - 1]}
                changed_count += len(comparison)
            report['frameComparisons'].append({
                'segmentNumber': row['segmentNumber'], 'globalRangeInclusive': [start, end],
                'reused': row['reused'], 'originTag': row['originTag'],
                'reference': reference, 'comparedFrames': len(comparison),
                'matchedFrames': len(comparison) - len(mismatches), 'mismatchFrames': mismatches,
            })
            require(not mismatches, f'Frame pixels/timing differ in segment {row["segmentNumber"]}')
        require(changed_count + reused_count == FRAMES, 'Not every final frame was compared')
        require(all(digest(path) == sha for path, sha in snapshot.items()), 'Input changed during identity verification')
        report.update({
            'passed': True, 'comparedFrames': FRAMES, 'matchedFrames': FRAMES,
            'newReviewedFramesCompared': changed_count, 'acceptedV13FramesCompared': reused_count,
            'decodedAllPixelsIdenticalToTheirSources': True, 'reusedVideoPacketsIdentical': True,
            'completeAACPayloadIdentical': True, 'aacTimingAndSkipMetadataIdentical': True,
            'audioStreamSHA256': audio_sha, 'audioPacketCount': len(old_audio),
            'wholeVideoPTSContinuous': True, 'wholeVideoDTSContinuous': True, 'inputHashesStable': True,
            'newSeamVisualReviewCompleted': False,
        })
    except Exception as error:
        report['error'] = str(error)
        raise
    finally:
        report['finishedAtUTC'] = datetime.now(timezone.utc).isoformat()
        report['evidence'] = [record(path) for path in sorted(out.iterdir()) if path.is_file()]
        report['scriptSHA256'] = digest(__file__)
        save(out / 'all-frame-audio-identity.json', report, exclusive=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', default='delivery/ShanghaiTower_1080p_v14.mp4')
    parser.add_argument('--manifest', default='tmp/v14-final-segments/segments.json')
    parser.add_argument('--out', default='research/qa/v14-release/identity')
    args = parser.parse_args()
    report = verify(args.video, args.manifest, args.out)
    print({key: report[key] for key in ['passed', 'videoSHA256', 'comparedFrames',
                                      'newReviewedFramesCompared', 'acceptedV13FramesCompared']})


if __name__ == '__main__':
    main()
