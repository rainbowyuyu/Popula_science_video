"""Create a small deterministic Lux3D Gaussian-splat sample for Remotion.

The full PLY remains the inspectable source. The film compositor uses this
sample so every frame stays deterministic and memory bounded.
"""
from __future__ import annotations
import argparse, json, math, struct
from pathlib import Path

def sample(src: Path, dst: Path, stride: int = 997) -> dict:
    with src.open('rb') as f:
        header = bytearray()
        while True:
            line = f.readline()
            if not line:
                raise RuntimeError('PLY header did not terminate')
            header += line
            if line == b'end_header\n':
                break
        text = header.decode('ascii', errors='replace')
        count_line = next((x for x in text.splitlines() if x.startswith('element vertex ')), '')
        count = int(count_line.rsplit(' ', 1)[-1])
        rec = struct.Struct('<17f')
        points = []
        for i in range(0, count, stride):
            f.seek(len(header) + i * rec.size)
            blob = f.read(rec.size)
            if len(blob) != rec.size:
                break
            d = rec.unpack(blob)
            opacity = 1 / (1 + math.exp(-max(-12, min(12, d[9]))))
            rgb = [max(0, min(1, 0.5 + 0.2820947918 * d[6 + j])) for j in range(3)]
            scale = max(0.002, min(0.02, sum(math.exp(max(-12, min(6, d[10 + j]))) for j in range(3)) / 3))
            points.append([round(d[0], 6), round(d[1], 6), round(d[2], 6),
                           round(rgb[0], 4), round(rgb[1], 4), round(rgb[2], 4),
                           round(opacity, 4), round(scale, 5)])
    payload = {
        'meta': {
            'source': 'Lux3D task 4040282 gaussian.ply',
            'sourceCount': count,
            'sampleStride': stride,
            'count': len(points),
            'record': 'x,y,z,r,g,b,opacity,scale',
            'purpose': 'deterministic preview splats in Remotion; physical optics remain Three.js model',
        },
        'points': points,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return payload['meta']

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', default='public/assets/lux3d/extracted/3dgs/gaussian.ply')
    ap.add_argument('--output', default='public/assets/lux3d/extracted/3dgs/gaussian-sampled.json')
    ap.add_argument('--stride', type=int, default=997)
    args = ap.parse_args()
    print(json.dumps(sample(Path(args.input), Path(args.output), args.stride), ensure_ascii=False))
