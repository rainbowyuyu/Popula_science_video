"""Read-only accepted V13 lineage checks for the V14 opening-only release.

The freeze_v12 tool deliberately retains its V11 baseline. That is a tooling
baseline, not the source of V14's reused frames: those must come from V13.
"""
from v12_common import (
    ROOT, FRAMES, FPS, RANGES, require, digest, read, record, project_path,
    verify_lock, verify_origin,
)

V13_VIDEO = ROOT / 'delivery/ShanghaiTower_1080p_v13.mp4'
V13_SHA = 'dec95e0f23bac0860638098afabe1dda80b2774472213f805b72179b4091187d'
V13_MANIFEST = ROOT / 'tmp/v13-final-segments/segments.json'
V13_PROVENANCE = ROOT / 'delivery/ShanghaiTower_1080p_v13.provenance.json'
V13_ACCEPTANCE = ROOT / 'research/qa/v13-final/acceptance.json'
V13_MARKER = ROOT / 'tmp/final-render-v13.json'


def checked_record(item):
    path = project_path(item['file'])
    require(digest(path) == item['sha256'], f'Bound evidence changed: {path}')
    if 'bytes' in item:
        require(path.stat().st_size == item['bytes'], f'Bound evidence size changed: {path}')
    return path


def verify_accepted_v13():
    require(digest(V13_VIDEO) == V13_SHA, 'Accepted V13 video changed')
    manifest, provenance, acceptance, marker = map(
        read, (V13_MANIFEST, V13_PROVENANCE, V13_ACCEPTANCE, V13_MARKER))
    require(manifest['status'] == 'complete-mixed-source'
            and manifest['ranges'] == RANGES and len(manifest['segments']) == len(RANGES)
            and manifest['totalFrames'] == FRAMES and manifest['fps'] == FPS,
            'V13 mixed-source manifest is incomplete')
    for report in (provenance, marker):
        require(report.get('success') is True and report['videoSHA256'] == V13_SHA
                and project_path(report['outputLocation']) == V13_VIDEO.resolve()
                and checked_record(report['mixedSourceManifest']) == V13_MANIFEST.resolve()
                and report['timelineSHA256'] == manifest['timelineSHA256']
                and report['masterSHA256'] == manifest['masterSHA256'],
                'V13 provenance/marker binding differs')
    require(provenance.get('finalVisualSeamAndAACAcceptancePending') is False
            and project_path(provenance['finalAcceptanceRecord']) == V13_ACCEPTANCE.resolve(),
            'V13 final acceptance is incomplete')
    require(acceptance['schema'] == 'rainbow.v13-final-acceptance/1'
            and checked_record(acceptance['video']) == V13_VIDEO.resolve()
            and checked_record(acceptance['provenance']) == V13_PROVENANCE.resolve()
            and acceptance['checks']['visualReview']['passed'] is True
            and acceptance['checks']['seamReview']['passed'] is True
            and acceptance['checks']['blackFrameScan']['passed'] is True,
            'V13 acceptance is stale or failed')
    lock_path = checked_record(acceptance['productionLock'])
    require(digest(lock_path) == manifest['productionLockSHA256']
            and project_path(manifest['productionLock']) == lock_path,
            'V13 production lock differs')
    verify_lock(lock_path)
    for key in ('newRenderManifest', 'segmentReview'):
        checked_record(acceptance[key])
    proof_path = checked_record(provenance['identityProof'])
    proof = read(proof_path)
    require(proof.get('passed') is True and proof['videoSHA256'] == V13_SHA
            and proof['comparedFrames'] == FRAMES and proof['matchedFrames'] == FRAMES
            and proof['completeAACPayloadIdentical'] is True,
            'V13 full-frame/audio identity proof is stale')
    for number, row in enumerate(manifest['segments'], 1):
        require(row['segmentNumber'] == number and [row['start'], row['end']] == RANGES[number - 1]
                and row['frames'] == row['end'] - row['start'] + 1
                and digest(project_path(row['outputLocation'])) == row['sha256'],
                'V13 source segment differs')
        verify_origin(row)
    return manifest, [record(path) for path in (
        V13_ACCEPTANCE, V13_PROVENANCE, V13_MARKER, proof_path)]
