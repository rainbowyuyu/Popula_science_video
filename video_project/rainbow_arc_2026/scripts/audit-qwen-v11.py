"""Audit V11 Qwen bridge continuity (native frame count and moving-tail joins)."""
from __future__ import annotations
import hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / 'src' / 'transitions-v11.json'
TL = ROOT / 'src' / 'timeline.json'
OUT = ROOT / 'research' / 'qa-v11'

def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def main() -> int:
    cfg = json.loads(CFG.read_text('utf8'))
    tl = json.loads(TL.read_text('utf8'))
    scene_starts = {s['id']: round(float(s['start']) * tl['fps']) for s in tl['scenes']}
    clip_starts = {c['id']: round(float(c['start']) * tl['fps']) for c in tl['clips']}
    rows, spans = [], []
    for b in cfg['clips']:
        a = b['anchor']
        base = 0 if a['kind'] == 'frame' else scene_starts.get(a.get('id')) if a['kind'] == 'scene' else clip_starts.get(a.get('id'))
        if base is None: raise SystemExit(f"unknown anchor: {b['id']}")
        start, end = base + int(a['offsetFrames']), base + int(a['offsetFrames']) + int(b['frames'])
        folder = ROOT / 'public' / b['framePath']
        fs = sorted(folder.glob('frame_*.jpg'))
        if len(fs) != b['frames']: raise SystemExit(f"{b['id']}: expected {b['frames']} frames, got {len(fs)}")
        hashes = [sha(p) for p in fs]
        tr = b['transition']
        if int(tr['overlapFrames']) <= 0 or int(tr['overlapFrames']) > min(int(tr['enterFrames']), int(tr['exitFrames'])):
            raise SystemExit(f"{b['id']}: invalid overlap/enter/exit")
        spans.append((start, end, b['id']))
        rows.append({'id': b['id'], 'startFrame': start, 'endFrameExclusive': end, 'frameCount': len(fs),
                     'duplicateAdjacentFrames': sum(x == y for x, y in zip(hashes, hashes[1:])), 'taskId': b['taskId']})
    spans.sort()
    joins = [{'from': a[2], 'to': b[2], 'gapFrames': b[0] - a[1], 'movingTailOverlap': b[0] == a[1]} for a, b in zip(spans, spans[1:])]
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'version': 'V11', 'nativeFPS': tl['fps'], 'bridges': rows, 'joins': joins,
              'generatedScienceData': False, 'contract': 'Each native Qwen frame advances once; contiguous joins blend moving tails.'}
    (OUT / 'qwen-transition-audit-v11.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf8')
    print(json.dumps(report, ensure_ascii=False, indent=2)); return 0

if __name__ == '__main__': raise SystemExit(main())
