from pathlib import Path
from datetime import datetime, timezone
import concurrent.futures
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[3]
GENERATED = ROOT / 'output-v16/work/qwen-v16/generated'
REVIEW = Path(__file__).parent
DENSE = json.loads((REVIEW / 'dense-manifest.json').read_text(encoding='utf-8'))

DETAILS = {
    'painted_to_garden_v16': {
        'status': 'pass', 'individualFullResolutionFrames': [51, 101, 126],
        'findings': [
            {'frames': [1, 51, 101, 126, 150], 'finding': 'The rounded mint/cream fish retains two dark eyes and one coherent body while the drawn contour becomes the authored 3D look. No sampled duplicate face or appended limb was observed.'},
            {'frames': [21, 46, 66, 86, 101], 'finding': 'Large defocused leaves move across the upper foreground, but the fish face remains readable. The path, pond and garden scenery gain dimensionality progressively.'},
            {'frames': [106, 126, 146, 150], 'finding': 'Fish size and garden framing approach the 3D endpoint progressively. No numeric optical explanation is generated in this bridge.'},
        ],
    },
    'garden_to_drop_v16': {
        'status': 'pass', 'individualFullResolutionFrames': [61, 156, 226],
        'findings': [
            {'frames': [11, 31, 61, 71, 96], 'finding': 'Focus transfers from the garden/fish to a centered transparent spherical drop. The fish becomes defocused and leaves the left edge through camera movement rather than duplication.'},
            {'frames': [101, 156, 191, 226, 300], 'finding': 'A single drop remains round with stable surface highlights while the garden reflection retreats into the dark optical background.'},
            {'frames': [191, 226, 271, 300], 'finding': 'Only the incoming white ray stub extends leftward to the authored entry point. No extra internal bounce or fabricated optical angle is introduced in the sampled bridge.'},
        ],
    },
    'drop_to_world_v16': {
        'status': 'pass', 'individualFullResolutionFrames': [16, 76, 101],
        'findings': [
            {'frames': [1, 16, 31, 46, 76], 'finding': 'The primary-rainbow optical path keeps its single internal reflection while the drop scales down into the rain curtain. The white incoming ray remains left of the drop and the spectral outgoing ray remains lower-left.'},
            {'frames': [81, 86, 91, 96, 101, 106], 'finding': 'The outgoing ray shortens progressively; the cute fish enters from the bottom-left, then recedes with the camera. It is partially cropped during entry, with an intact face and coherent body when visible.'},
            {'frames': [111, 126, 146, 150], 'finding': 'The garden, rainbow and fish settle into the authored wide framing. The remaining white beam is above the fish and does not obscure its eyes.'},
        ],
    },
    'secondary_to_world_v16': {
        'status': 'reject', 'individualFullResolutionFrames': [16, 26, 31, 126],
        'findings': [
            {'frames': [16], 'severity': 'blocking', 'finding': 'The generated secondary optical polyline moves its lower reflection kink into the interior of the spherical drop, detached from the surface boundary.'},
            {'frames': [26, 31, 36], 'severity': 'blocking', 'finding': 'The fixed two-reflection scientific path morphs into a curved L-shaped line in homogeneous water. This creates a visible false teaching image and cannot be accepted as the same optical mechanism.'},
            {'frames': [96, 106, 126, 150], 'finding': 'The later double-rainbow garden and bottom-edge fish entry are coherent, but they do not remove the earlier scientific-path error.'},
        ],
        'repair': 'Complete the deterministic two-reflection explanation first. Keep the original polyline fixed while its light extinguishes, then let Qwen move a ray-free transparent drop back into the garden.',
    },
    'fountain_to_painted_v16': {
        'status': 'reject', 'individualFullResolutionFrames': [46, 106, 126, 136],
        'findings': [
            {'frames': [46, 51, 56, 61, 66], 'finding': 'The fish keeps its mint/cream rounded body and moves through the right/top edge as the camera approaches the pool. No sampled duplicate eyes or body was observed.'},
            {'frames': [81, 91, 106], 'finding': 'Water-drop splash and rings provide a suitable foreground anchor for the coda. This is artistic splash animation, not an audited fluid solver.'},
            {'frames': [111, 116, 121, 126, 131, 136, 141], 'severity': 'blocking', 'finding': 'An approximately one-second full-scene double exposure overlays the old pool rim and water ripples on the emerging watercolor village. In full-resolution F126 the stone bank hangs across the painted sky; F136 still shows the old stone silhouettes above the rainbow. This breaks the intended continuous camera handoff.'},
        ],
        'repair': 'Move the camera close enough that the pool rim leaves the frame before transforming the foreground ripple contour into paper/watercolor, then pull back to reveal the village.',
    },
}

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def analyze(key):
    folder = GENERATED / key
    provenance = json.loads((folder / 'provenance.json').read_text(encoding='utf-8'))
    movie = folder / 'provider.mp4'
    before = sha(movie)
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-xerror', '-i', str(movie), '-map', '0:v:0', '-an', '-f', 'null', '-']
    decoded = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    frames = sorted((folder / 'frames').glob('frame_*.jpg'))
    hashes = [sha(path) for path in frames]
    if before != provenance['providerSHA256'] or sha(movie) != before:
        raise RuntimeError(f'{key}: provider changed or does not match provenance')
    if hashes != provenance['frameHashes']:
        raise RuntimeError(f'{key}: extracted frame hashes differ from provenance')
    if decoded.returncode != 0:
        raise RuntimeError(f'{key}: full decode failed: {decoded.stderr}')
    details = DETAILS[key]
    contact_frames = [1, 2, 16, 46, 76, 106, 136, 149, 150] if len(frames) == 150 else [1, 2, 31, 91, 151, 211, 271, 299, 300]
    inspected = sorted(set(DENSE[key]['sampledFrames'] + contact_frames + details['individualFullResolutionFrames']))
    result = {
        'version': 'V16',
        'id': key,
        'taskId': provenance['taskId'],
        'scientificAuthority': False,
        'sourceUnmodified': True,
        'status': details['status'],
        'providerSHA256': before,
        'reviewedUTC': datetime.now(timezone.utc).isoformat(),
        'reviewer': '/root/v14_fish independent visual QA',
        'scope': 'Actual contact plus native-frame dense sheets every 5 frames, and separately opened full-resolution 1920x1080 frames. All provider video frames were strictly decoded and all extracted JPEG hashes were bound to provenance.',
        'inspectedFrames': inspected,
        'nativeFrameNumbering': 'One-based: frame_0001.jpg is decoded frame index 0.',
        'individualFullResolutionFrames': details['individualFullResolutionFrames'],
        'denseSheetsActuallyViewed': DENSE[key]['sheets'],
        'normalSpeedPlaybackReviewed': False,
        'everyFrameManuallyReviewed': False,
        'audioListened': False,
        'providerAudioUsed': provenance.get('audioUsed', False),
        'technicalChecks': {'strictFullVideoDecodeExitCode': decoded.returncode, 'frameCount': len(frames), 'allExtractedFrameHashesMatchProvenance': True, 'adjacentIdenticalJPEGHashes': sum(a == b for a,b in zip(hashes, hashes[1:])), 'fps': provenance['nativeFPS'], 'width': provenance['nativeWidth'], 'height': provenance['nativeHeight']},
        'findings': details['findings'],
        'limits': 'This is a source-clip sampled visual decision. It does not certify every unsampled frame, normal-speed perceived motion, listening, final composite subtitles/logo, or the complete encoded film. Generated transitions are artistic and do not replace deterministic optics validation.',
    }
    if 'repair' in details:
        result['repair'] = details['repair']
    target = folder / 'visual-acceptance.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    (REVIEW / f'{key}-review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(analyze, DETAILS))
    summary = {'generatedUTC': datetime.now(timezone.utc).isoformat(), 'reviewer': '/root/v14_fish', 'reviews': results}
    (REVIEW / 'independent-source-clips-review-v16.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value['status'] for key,value in zip(DETAILS,results)}))
