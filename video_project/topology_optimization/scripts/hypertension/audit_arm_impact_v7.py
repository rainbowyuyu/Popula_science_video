"""Bound V7 arm edits using production snapshots and full-frame geometry audit.

This produces a conservative influence boundary, not a GPU pixel-equality claim.
The selected replacement begins before that boundary.
"""
from pathlib import Path
import datetime
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/hypertension'

def read(relative):
    return (ROOT / relative).read_text(encoding='utf-8')

def digest(relative):
    return hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()

def main():
    geometry = json.loads(read('research/hypertension/arm-v7-geometry-qa.json'))
    annotations = json.loads(read('research/hypertension/annotations-v7-qa.json'))
    camera = json.loads(read('research/hypertension/camera-v7-audit.json'))
    timeline = json.loads(read('src/hypertension/timeline.json'))
    old_annotations = read('research/hypertension/Annotations-before-v7.txt')
    new_annotations = read('src/hypertension/Annotations.ts')
    old_target = "cue('arm-support','手臂承托','h047',[.25,.88],'measureForearm',1,-100,165)"
    new_target = old_target.replace("'measureForearm'", "'measureForearmSurface'")
    old_resolver = "if(name==='measureCuff'||name==='measureForearm')"
    new_resolver = "if(name==='measureCuff'||name==='measureForearm'||name==='measureForearmSurface')"
    expected_annotations = old_annotations.replace(old_target, new_target).replace(old_resolver, new_resolver)
    h047 = next(c for c in timeline['clips'] if c['id'] == 'h047')
    annotation_boundary = math.floor(h047['start'] + h047['duration'] * .25) + 1
    scope = geometry['visibilityScope']
    boundaries = {
        'currentMeasurementStage': scope['firstCurrentStageFrustumIntersection'],
        'priorMeasurementStage': scope['firstPriorStageFrustumIntersection'],
        'currentChangedShadowVolumes': scope['firstCurrentShadowVolumeFrustumIntersection'],
        'priorChangedShadowVolumes': scope['firstPriorShadowVolumeFrustumIntersection'],
        'cameraPose': scope['firstChangedCameraFrame'],
        'changedAnnotationCue': annotation_boundary,
    }
    earliest = min(v for v in boundaries.values() if v is not None)
    current_hashes = {name: digest(name) for name in annotations['sourceHashes']}
    snapshot_hashes = {
        name: digest(f'research/hypertension/{name}-before-v7.txt')
        for name in ['World', 'Annotations', 'CameraPath']
    }
    checks = {
        'geometryAuditPassed': geometry['passed'] and geometry['sourceStable'],
        'sourceChangeConfinedToBuildMeasure': scope['sourceChangeConfinedToBuildMeasure'],
        'geometrySourceMatches': geometry['sourceHash'] == current_hashes['src/hypertension/World.ts'],
        'priorWorldSnapshotMatches': geometry['priorSourceHash'] == snapshot_hashes['World'],
        'cameraSourceUnchanged': read('research/hypertension/CameraPath-before-v7.txt') == read('src/hypertension/CameraPath.ts'),
        'annotationsOnlyExpectedCueAndResolverChange': expected_annotations == new_annotations and old_annotations.count(old_target) == 1 and old_annotations.count(old_resolver) == 1,
        'newAnnotationAnchorUsedOnlyByArmSupportAndResolver': new_annotations.count('measureForearmSurface') == 2,
        'allFramesChecked': annotations['frames'] == camera['frames'] == timeline['duration'] == 9671,
        'cameraAuditPassed': camera['passed'],
        'annotationAuditPassed': annotations['passed'] and annotations['sourceStable'],
        'annotationSourcesCurrent': all(current_hashes[name] == value for name, value in annotations['sourceHashes'].items()),
        'cameraSourcesCurrent': all(digest(name) == value for name, value in camera['sourceHashes'].items()),
        'noPre8000Influence': scope['pre8000PotentialInfluenceCount'] == 0 and scope['maxCameraDifferenceBefore8000'] == 0,
        'replacementCoversInfluence': scope['safeForReplacement'] and earliest >= 8000,
    }
    report = {
        'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'passed': all(checks.values()),
        'safeReplacementStart': earliest,
        'safeReplacementStartMeaning': 'Conservative earliest frame at which any V7 arm-related geometry, shadow, camera or annotation pixel may change; earlier frames are outside the evaluated influence bounds. The actual replacement starts at 8000, before this boundary.',
        'recommendedReplacement': [8000, timeline['duration'] - 1],
        'framesChecked': timeline['duration'],
        'potentialInfluenceBoundaries': boundaries,
        'checks': checks,
        'sourceHashes': current_hashes,
        'priorSnapshotHashes': snapshot_hashes,
        'evidence': {
            'geometry': 'research/hypertension/arm-v7-geometry-qa.json',
            'camera': 'research/hypertension/camera-v7-audit.json',
            'annotations': 'research/hypertension/annotations-v7-qa.json',
        },
        'method': [
            'Exact before/current source comparison confines World changes to buildMeasure, leaves CameraPath unchanged, and isolates the two expected arm-support annotation edits.',
            'Production before/current measurement builders and cameraAt evaluated at all 9671 timeline frames; stage bounds are conservatively frustum-tested for both versions.',
            'Changed shadow casters identified by exact position/index bytes, world matrix and material side. Each caster bounding box is directionally swept to floor y=-0.34 and checked as a convex vertex set against each frustum plane, with 0.15 world-unit dilation for bias/PCF fringe.',
            'Unchanged casters are removed only because both camera and directional-light transforms remain identical before frame 8000. Production fill/hemisphere lights and precomputed RoomEnvironment add no dynamic scene shadows or reflections.',
            'Annotation source changes affect only arm-support, whose first integer active frame is 8604; current full-GLB production annotation audit also passes all 9671 frames.',
        ],
        'limitations': 'Conservative scene-state and frustum influence proof; no claim of encoded pixel equality, GPU execution, or complete playback inspection. Final rendered join and export inspection remain separate.',
    }
    (RESEARCH / 'arm-v7-impact-scope.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'safeReplacementStart': earliest, 'checks': checks}, indent=2))
    if not report['passed']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
