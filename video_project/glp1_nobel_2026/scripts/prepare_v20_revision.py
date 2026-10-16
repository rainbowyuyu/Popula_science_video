"""Prepare an isolated, frame-preserving revision of the opening."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/v20-opening-patches'
OUT.mkdir(parents=True, exist_ok=True)

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

renderer = (ROOT / 'scripts/render_v19_person.mjs').read_text(encoding='utf8')
renderer = renderer.replace('V19', 'V20').replace('v19-person', 'v20-opening')
renderer = renderer.replace('render_v19_person.mjs', 'render_v20_opening.mjs')
(ROOT / 'scripts/render_v20_opening.mjs').write_text(renderer, encoding='utf8')

composer = (ROOT / 'scripts/compose_v19.py').read_text(encoding='utf8')
composer = composer.replace('V19', 'V20').replace('v19', 'v20')
composer = composer.replace('V18', 'V19').replace('v18', 'v19')
composer = composer.replace('tmp/v20-person-patches', 'tmp/v20-opening-patches')
composer = composer.replace('tmp/v19-compose-caption/final-composed.yuv.sha256', 'tmp/v19-compose-hands/final-composed.yuv.sha256')
composer = composer.replace("OUTPUT = ROOT / 'delivery/如何科学减肥_从身体调节说起_V20_1080p.mp4'", "OUTPUT = ROOT / 'delivery/一顿饭后_身体在忙什么_V20_1080p.mp4'")
composer = composer.replace("TITLE = '如何科学减肥？从身体调节说起'", "TITLE = '一顿饭后，身体在忙什么？'")
composer = composer.replace('public/master.wav', 'public/master-v20.wav')
composer = composer.replace("FULL, base_timing['keyframePresentationFrames'])", "FULL, state['baseTiming']['keyframePresentationFrames'])")
(ROOT / 'scripts/compose_v20.py').write_text(composer, encoding='utf8')

base = ROOT / 'delivery/如何科学减肥_从身体调节说起_V19_1080p.mp4'
validation_path = base.with_suffix('.validation.json')
validation = json.loads(validation_path.read_text(encoding='utf8'))
assert validation['videoSHA256'] == digest(base)
assert validation['fullDecodeSuccess'] and validation['frameCorrespondence']['allFramesMatched']
framehash = ROOT / 'tmp/v19-compose-hands/final-composed.yuv.sha256'
assert validation['frameCorrespondence']['final']['sha256'] == digest(framehash)

manifest = {
    'base': str(base.relative_to(ROOT)).replace('\\', '/'),
    'baseSHA256': digest(base),
    'framehash': str(framehash.relative_to(ROOT)).replace('\\', '/'),
    'framehashSHA256': digest(framehash),
    'helper': 'scripts/verify_idr_splice_v6.py',
    'helperSHA256': digest(ROOT / 'scripts/verify_idr_splice_v6.py'),
    'frames': 26738, 'fps': 30, 'pixelFormat': 'yuv420p', 'dimensions': [1920,1080],
    'decodedPresentationTimestampsExact': True, 'allFrameDurationsExact': True,
    'fullDecodeSuccess': True,
    'sourceValidation': str(validation_path.relative_to(ROOT)).replace('\\', '/'),
    'sourceValidationSHA256': digest(validation_path),
}
(OUT / 'base-v19-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
plan = {
    'base': str(base.relative_to(ROOT)).replace('\\', '/'), 'baseSHA256': digest(base),
    'frames': 26738, 'fps': 30,
    'captionSupportFrames': [[0,296]],
    'patches': [{'start': 0, 'end': 499, 'path': 'tmp/v20-opening-patches/000000-000499.mp4',
                 'reason': 'Everyday meal question opening; title and h001 captions only. Unchanged 3D camera and body animation.'}],
}
(OUT / 'plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf8')
print('Prepared opening patch F0–499 and authenticated V19 baseline.')
